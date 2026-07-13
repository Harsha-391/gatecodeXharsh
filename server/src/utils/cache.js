// server/src/utils/cache.js
class MemoryCache {
    constructor() {
        this.cache = new Map();
    }

    set(key, value, ttlSeconds = 300) {
        const expiresAt = Date.now() + (ttlSeconds * 1000);
        this.cache.set(key, { value, expiresAt });
    }

    get(key) {
        const record = this.cache.get(key);
        if (!record) return null;
        if (Date.now() > record.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return record.value;
    }

    delete(key) {
        this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }
}

module.exports = new MemoryCache();
