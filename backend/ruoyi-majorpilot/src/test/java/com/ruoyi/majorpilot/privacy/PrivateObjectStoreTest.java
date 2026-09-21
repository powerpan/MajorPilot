package com.ruoyi.majorpilot.privacy;

import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.FileTime;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

/** Real filesystem tests. No application, database, credentials or network are used. */
class PrivateObjectStoreTest {
    static final String ID="00000000000000000000000001";
    static final String STUDENT="student/"+ID+".zip", ADMIN="admin/"+ID+".csv";
    static final String UNAVAILABLE="PRIVATE_EXPORT_STORAGE_UNAVAILABLE";
    static final long MAX_BYTES=64L*1024*1024;
    @TempDir Path temporary;
    Path root;PrivateObjectStore store;
    @BeforeEach void setup()throws Exception{root=temporary.toRealPath().resolve("private-exports");store=new PrivateObjectStore(root.toString());}

    @Test void publishesBothKindsWithExactBytesHashAndPrivatePermissions()throws Exception{
        byte[] bytes="用户自己的资料\n\"safe\"".getBytes(StandardCharsets.UTF_8);
        for(String key:List.of(STUDENT,ADMIN)){
            var written=store.write(key,bytes);
            assertEquals(key,written.key());assertEquals(bytes.length,written.size());
            assertEquals(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)),written.sha256());
            assertArrayEquals(bytes,store.read(key));
            assertEquals(PosixFilePermissions.fromString("rw-------"),Files.getPosixFilePermissions(root.resolve(key)));
            assertEquals(PosixFilePermissions.fromString("rwx------"),Files.getPosixFilePermissions(root.resolve(key).getParent()));
            try(var entries=Files.list(root.resolve(key).getParent())){assertEquals(1,entries.count());}
        }
        assertEquals(PosixFilePermissions.fromString("rwx------"),Files.getPosixFilePermissions(root));
    }

    @Test void rejectsTraversalAbsoluteUnknownAndMalformedKeysWithoutSideEffects()throws Exception{
        List<String> invalid=Arrays.asList(null,"","../outside.zip","student/../"+ID+".zip",root.resolve(STUDENT).toString(),
            "student/"+ID+".csv","admin/"+ID+".zip","student/"+ID+".zip?download=1","student\\"+ID+".zip",
            "student//"+ID+".zip","student/80000000000000000000000000.zip","student/0000000000000000000000000I.zip",
            "student/0000000000000000000000000a.zip","student/"+ID+".zip/child","student/%2e%2e/out.zip");
        for(String key:invalid){
            assertEquals("Invalid private object key",assertThrows(IllegalArgumentException.class,()->store.write(key,new byte[]{1})).getMessage());
            assertThrows(IllegalArgumentException.class,()->store.read(key));
            if(key!=null)assertThrows(IllegalArgumentException.class,()->store.delete(key));
        }
        try(var entries=Files.list(root)){assertEquals(0,entries.count());}
    }

    @Test void rejectsRootOrIntermediateSymlinkAndNonDirectoryAncestors()throws Exception{
        Path outside=Files.createDirectory(temporary.toRealPath().resolve("outside"));
        Path alias=temporary.toRealPath().resolve("alias");Files.createSymbolicLink(alias,outside);
        assertUnavailable(()->new PrivateObjectStore(alias.resolve("nested").toString()));
        assertFalse(Files.exists(outside.resolve("nested")));
        Files.createSymbolicLink(root.resolve("student"),outside);
        assertUnavailable(()->store.write(STUDENT,new byte[]{1}));assertUnavailable(()->store.read(STUDENT));assertUnavailable(()->store.delete(STUDENT));
        assertFalse(Files.exists(outside.resolve(ID+".zip")));
        Path regular=temporary.toRealPath().resolve("not-a-folder");Files.writeString(regular,"sentinel");
        assertUnavailable(()->new PrivateObjectStore(regular.resolve("nested").toString()));assertEquals("sentinel",Files.readString(regular));
    }

    @Test void rejectsTargetSymlinksAndDirectoriesWithoutFollowingOrDeletingThem()throws Exception{
        Path external=temporary.toRealPath().resolve("external.txt");Files.writeString(external,"do not modify");
        Files.createDirectory(root.resolve("student"));Path link=root.resolve(STUDENT);Files.createSymbolicLink(link,external);
        assertUnavailable(()->store.write(STUDENT,new byte[]{2}));assertUnavailable(()->store.read(STUDENT));assertUnavailable(()->store.delete(STUDENT));
        assertTrue(Files.isSymbolicLink(link));assertEquals("do not modify",Files.readString(external));
        Files.createDirectories(root.resolve(ADMIN));
        assertUnavailable(()->store.write(ADMIN,new byte[]{2}));assertUnavailable(()->store.read(ADMIN));assertUnavailable(()->store.delete(ADMIN));
        assertTrue(Files.isDirectory(root.resolve(ADMIN)));
    }

    @Test void existingPublishedObjectIsNotReplacedAndDeletionIsIdempotent()throws Exception{
        store.write(STUDENT,new byte[]{1,2,3});assertUnavailable(()->store.write(STUDENT,new byte[]{9}));assertArrayEquals(new byte[]{1,2,3},store.read(STUDENT));
        try(var entries=Files.list(root.resolve("student"))){assertEquals(1,entries.count());}
        store.delete(STUDENT);store.delete(STUDENT);store.delete(null);assertFalse(Files.exists(root.resolve(STUDENT)));assertUnavailable(()->store.read(STUDENT));
    }

    @Test void readersSeeAnAbsentOrCompleteAtomicPublicationNeverPartialBytes()throws Exception{
        byte[] bytes=new byte[8*1024*1024];Arrays.fill(bytes,(byte)0x6d);
        try(var executor=Executors.newSingleThreadExecutor()){
            var started=new CountDownLatch(1);Future<PrivateObjectStore.Stored> writing=executor.submit(()->{started.countDown();return store.write(STUDENT,bytes);});
            assertTrue(started.await(2,TimeUnit.SECONDS));
            for(int n=0;n<100&&!writing.isDone();n++){
                try{assertArrayEquals(bytes,store.read(STUDENT));}catch(IllegalStateException absent){assertEquals(UNAVAILABLE,absent.getMessage());}
            }
            assertEquals(bytes.length,writing.get(10,TimeUnit.SECONDS).size());assertArrayEquals(bytes,store.read(STUDENT));
        }
    }

    @Test void byteLimitsRejectOversizedWritesAndSparseReadsBeforeLoadingThem()throws Exception{
        assertEquals("EXPORT_SIZE_LIMIT",assertThrows(IllegalArgumentException.class,()->store.write(STUDENT,null)).getMessage());
        assertEquals("EXPORT_SIZE_LIMIT",assertThrows(IllegalArgumentException.class,()->store.write(STUDENT,new byte[(int)MAX_BYTES+1])).getMessage());
        assertFalse(Files.exists(root.resolve(STUDENT)));
        Files.createDirectory(root.resolve("student"));
        try(var channel=FileChannel.open(root.resolve(STUDENT),StandardOpenOption.CREATE_NEW,StandardOpenOption.WRITE)){channel.position(MAX_BYTES);channel.write(ByteBuffer.wrap(new byte[]{1}));}
        assertEquals(MAX_BYTES+1,Files.size(root.resolve(STUDENT)));assertUnavailable(()->store.read(STUDENT));
        store.delete(STUDENT);store.write(STUDENT,new byte[0]);assertEquals(0,store.read(STUDENT).length);
    }

    @Test void partialRetentionUsesStrictAgeAndBoundedBatchWithoutTouchingPublishedFiles()throws Exception{
        Instant cutoff=Instant.parse("2026-09-20T00:00:00Z");store.write(STUDENT,new byte[]{7});store.write(ADMIN,new byte[]{8});
        Path first=partial("student/.partial-old-a.tmp",cutoff.minusSeconds(1)),second=partial("admin/.partial-old-b.tmp",cutoff.minusSeconds(2));
        Path boundary=partial("student/.partial-boundary.tmp",cutoff),future=partial("admin/.partial-future.tmp",cutoff.plusSeconds(1)),other=partial("admin/ordinary.tmp",cutoff.minusSeconds(10));
        assertEquals(1,store.deletePartialsBefore(cutoff,1));assertNotEquals(Files.exists(first),Files.exists(second));
        assertEquals(1,store.deletePartialsBefore(cutoff,100));assertEquals(0,store.deletePartialsBefore(cutoff,100));
        assertTrue(Files.exists(boundary));assertTrue(Files.exists(future));assertTrue(Files.exists(other));assertArrayEquals(new byte[]{7},store.read(STUDENT));assertArrayEquals(new byte[]{8},store.read(ADMIN));
    }

    @Test void partialRetentionRejectsSymlinksAndInvalidScopes()throws Exception{
        Files.createDirectory(root.resolve("student"));Path external=temporary.toRealPath().resolve("outside.tmp");Files.writeString(external,"keep");
        Files.createSymbolicLink(root.resolve("student/.partial-link.tmp"),external);
        assertUnavailable(()->store.deletePartialsBefore(Instant.now().plusSeconds(1),100));assertEquals("keep",Files.readString(external));
        assertThrows(IllegalArgumentException.class,()->store.deletePartialsBefore(null,100));
        for(int count:List.of(0,-1,501))assertThrows(IllegalArgumentException.class,()->store.deletePartialsBefore(Instant.now(),count));
    }

    private Path partial(String relative,Instant at)throws Exception{Path path=root.resolve(relative);Files.write(path,new byte[]{1});Files.setLastModifiedTime(path,FileTime.from(at));return path;}
    private static void assertUnavailable(org.junit.jupiter.api.function.Executable call){var error=assertThrows(IllegalStateException.class,call);assertEquals(UNAVAILABLE,error.getMessage());assertNull(error.getCause());}
}
