import { describe, it, expect, beforeEach } from 'vitest';
import { MessageQueue2 } from '@/utils/MessageQueue2';

describe('MessageQueue2 reset() on reactivation', () => {
    let queue: MessageQueue2<{ mode: string }>;

    beforeEach(() => {
        queue = new MessageQueue2(m => m.mode);
    });

    it('should clear queued messages when reset() is called', async () => {
        // Push some messages
        queue.push('Old message 1', { mode: 'default' });
        queue.push('Old message 2', { mode: 'default' });
        
        expect(queue.size()).toBe(2);
        
        // Reset (as would happen on reactivation)
        queue.reset();
        
        expect(queue.size()).toBe(0);
    });

    it('should allow new messages after reset', async () => {
        // Old session messages
        queue.push('Old message', { mode: 'default' });
        queue.reset();
        
        // New session messages (after reactivation)
        queue.push('New message', { mode: 'default' });
        
        expect(queue.size()).toBe(1);
        
        const msg = await queue.waitForMessages();
        expect(msg?.message).toBe('New message');
    });

    it('should be usable immediately after reset', async () => {
        queue.push('Message 1', { mode: 'default' });
        queue.reset();
        expect(queue.isClosed()).toBe(false);
        
        // Should be able to push immediately
        queue.push('Message 2', { mode: 'default' });
        expect(queue.size()).toBe(1);
    });
});
