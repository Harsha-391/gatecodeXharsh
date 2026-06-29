// server/src/utils/queue.js
/**
 * Distributed Task & Background Job Queue (BullMQ Wrapper)
 * Automatically falls back to in-memory task loops if Redis is not configured.
 */

const REDIS_URL = process.env.REDIS_URL;
let taskQueue = null;

// Lightweight in-memory fallback processor
class LocalJobQueue {
    constructor(name) {
        this.name = name;
        this.jobs = [];
        this.processors = [];
        console.log(`🔌 [LocalQueue] Initialized in-memory fallback queue: ${name}`);
    }

    async add(jobName, data) {
        const job = { id: Math.random().toString(36).substring(2), name: jobName, data, status: 'waiting' };
        this.jobs.push(job);
        
        // Execute asynchronously
        setImmediate(() => this.processJob(job));
        return job;
    }

    process(processor) {
        this.processors.push(processor);
    }

    async processJob(job) {
        job.status = 'active';
        for (const proc of this.processors) {
            try {
                await proc(job);
                job.status = 'completed';
            } catch (err) {
                job.status = 'failed';
                console.error(`❌ [LocalQueue] Job ${job.id} failed:`, err.message);
            }
        }
    }
}

function getQueue(queueName) {
    if (REDIS_URL) {
        try {
            const { Queue } = require('bullmq');
            const IORedis = require('ioredis');
            const connection = new IORedis(REDIS_URL);
            return new Queue(queueName, { connection });
        } catch (err) {
            console.warn('⚠️ BullMQ/Redis load failed. Falling back to local queue.', err.message);
        }
    }
    
    // In-memory queue fallback
    if (!taskQueue) {
        taskQueue = new LocalJobQueue(queueName);
    }
    return taskQueue;
}

module.exports = { getQueue };
