package com.ruoyi.majorpilot.auth;

import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

/** Pure transaction lifecycle probe; database rollback/locks are tested separately. */
final class AuthTestTransactions extends AbstractPlatformTransactionManager {
    volatile int commits,rollbacks,begins;
    final java.util.concurrent.CountDownLatch finished=new java.util.concurrent.CountDownLatch(1);
    TransactionTemplate template(){return new TransactionTemplate(this);}
    @Override protected Object doGetTransaction(){return new Object();}
    @Override protected void doBegin(Object transaction,TransactionDefinition definition){begins++;}
    @Override protected void doCommit(DefaultTransactionStatus status){commits++;finished.countDown();}
    @Override protected void doRollback(DefaultTransactionStatus status){rollbacks++;finished.countDown();}
}
