package interview.guide.common.transaction;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.function.Supplier;

/**
 * 小范围事务执行器，用于避免同类内部调用导致事务注解失效。
 */
@Service
public class TransactionalExecutor {

    //为了解决不要同类内部调用 @Transactional 方法的问题

    //用于执行没有返回值的数据库操作
    @Transactional(rollbackFor = Exception.class)//表示只要 Lambda 抛出 Exception，就回滚事务
    public void run(Runnable action) {
        action.run();
    }

    @Transactional(rollbackFor = Exception.class)
    public <T> T call(Supplier<T> action) {
        return action.get();
    }

    //强制创建事务
    @Transactional(rollbackFor = Exception.class, propagation = Propagation.REQUIRES_NEW)
    public void runRequiresNew(Runnable action) {
        action.run();
    }

    @Transactional(rollbackFor = Exception.class, propagation = Propagation.REQUIRES_NEW)
    public <T> T callRequiresNew(Supplier<T> action) {
        return action.get();
    }
}
