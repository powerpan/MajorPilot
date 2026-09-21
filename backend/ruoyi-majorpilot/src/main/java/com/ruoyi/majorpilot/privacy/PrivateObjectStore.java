package com.ruoyi.majorpilot.privacy;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Local private export storage. Keys are server-generated, never filesystem paths from a request. */
@Component @Profile("local")
public class PrivateObjectStore {
    public record Stored(String key,String sha256,long size) {}
    private static final long MAX_BYTES=64L*1024*1024;
    private final Path base;
    public PrivateObjectStore(@Value("${MP_PRIVATE_EXPORT_ROOT:./data/private-exports}") String root) {
        base=Path.of(root).toAbsolutePath().normalize();
        try { secureDirectories(base); } catch(IOException failure) { throw failure(); }
    }
    public Stored write(String logicalKey,byte[] bytes) {
        if(bytes==null||bytes.length>MAX_BYTES)throw new IllegalArgumentException("EXPORT_SIZE_LIMIT");
        Path target=path(logicalKey),temp=null;
        try {
            secureDirectories(target.getParent());checkRegularOrAbsent(target);
            if(Files.exists(target,LinkOption.NOFOLLOW_LINKS))throw new IOException("Already exists");
            temp=Files.createTempFile(target.getParent(),".partial-",".tmp",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
            Files.write(temp,bytes,StandardOpenOption.TRUNCATE_EXISTING,StandardOpenOption.WRITE);
            // A lease always owns a fresh logical key; never overwrite another attempt's file.
            Files.move(temp,target,StandardCopyOption.ATOMIC_MOVE);temp=null;
            return new Stored(logicalKey,HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)),bytes.length);
        } catch(Exception failure) { throw failure(); }
        finally { if(temp!=null)try{Files.deleteIfExists(temp);}catch(IOException ignored){/* Bounded retention collects stale partials. */} }
    }
    public byte[] read(String logicalKey) {
        Path target=path(logicalKey);
        try {
            checkAncestors(target.getParent());checkRegularOrAbsent(target);
            if(!Files.isRegularFile(target,LinkOption.NOFOLLOW_LINKS)||Files.size(target)>MAX_BYTES)throw new IOException("Unavailable");
            return Files.readAllBytes(target);
        } catch(IOException failure) { throw failure(); }
    }
    public void delete(String logicalKey) {
        if(logicalKey==null)return;
        Path target=path(logicalKey);
        try {checkAncestors(target.getParent());checkRegularOrAbsent(target);Files.deleteIfExists(target);}
        catch(IOException failure) {throw failure();}
    }
    /** Only abandoned temp writes, never a published export. Caller supplies an explicit age boundary. */
    public int deletePartialsBefore(java.time.Instant cutoff,int limit) {
        if(cutoff==null||limit<1||limit>500)throw new IllegalArgumentException("Invalid retention scope");
        int deleted=0;
        try {
            for(String folder:Set.of("student","admin")) {
                Path dir=base.resolve(folder);checkAncestors(dir);if(!Files.exists(dir))continue;
                try(var entries=Files.newDirectoryStream(dir,".partial-*.tmp")) {
                    for(Path file:entries) {checkRegularOrAbsent(file);if(Files.getLastModifiedTime(file,LinkOption.NOFOLLOW_LINKS).toInstant().isBefore(cutoff)){Files.delete(file);if(++deleted>=limit)return deleted;}}
                }
            }
            return deleted;
        }catch(IOException failure){throw failure();}
    }
    private Path path(String key) {
        if(key==null||!key.matches("(?:student/[0-7][0-9A-HJKMNP-TV-Z]{25}\\.zip|admin/[0-7][0-9A-HJKMNP-TV-Z]{25}\\.csv)"))throw new IllegalArgumentException("Invalid private object key");
        Path result=base.resolve(key).normalize();if(!result.startsWith(base))throw new IllegalArgumentException("Invalid private object key");return result;
    }
    private static void checkRegularOrAbsent(Path file)throws IOException {
        if(Files.exists(file,LinkOption.NOFOLLOW_LINKS)&&(!Files.isRegularFile(file,LinkOption.NOFOLLOW_LINKS)||Files.isSymbolicLink(file)))throw new IOException("Unsafe object");
    }
    private static void checkAncestors(Path directory)throws IOException {
        for(Path p=directory;p!=null;p=p.getParent())if(Files.exists(p,LinkOption.NOFOLLOW_LINKS)&&(!Files.isDirectory(p,LinkOption.NOFOLLOW_LINKS)||Files.isSymbolicLink(p)))throw new IOException("Unsafe directory");
    }
    private static void secureDirectories(Path directory)throws IOException {
        checkAncestors(directory);Files.createDirectories(directory,PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));checkAncestors(directory);
    }
    private static IllegalStateException failure(){return new IllegalStateException("PRIVATE_EXPORT_STORAGE_UNAVAILABLE");}
}
