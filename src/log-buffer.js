/**
 * Memory-efficient ring buffer for server logs.
 * Keeps only the last N lines in a fixed-size circular buffer.
 */
class LogBuffer {
    constructor(maxLines = 2000) {
        this.maxLines = maxLines;
        this.buffer = new Array(maxLines);
        this.head = 0;
        this.count = 0;
        this.listeners = new Set();
    }

    push(line) {
        // Filter out known spammy warnings from llama-server router mode
        if (line.includes('all tasks already finished, no need to cancel')) {
            return;
        }

        const entry = {
            ts: Date.now(),
            text: line,
        };
        this.buffer[this.head] = entry;
        this.head = (this.head + 1) % this.maxLines;
        if (this.count < this.maxLines) this.count++;
        // Notify listeners
        for (const fn of this.listeners) {
            try { fn(entry); } catch (_) { /* ignore */ }
        }
    }

    getAll() {
        if (this.count === 0) return [];
        const result = [];
        const start = this.count < this.maxLines ? 0 : this.head;
        for (let i = 0; i < this.count; i++) {
            const idx = (start + i) % this.maxLines;
            result.push(this.buffer[idx]);
        }
        return result;
    }

    getLast(n) {
        const all = this.getAll();
        return all.slice(-n);
    }

    clear() {
        this.buffer = new Array(this.maxLines);
        this.head = 0;
        this.count = 0;
    }

    onLine(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }
}

module.exports = LogBuffer;
