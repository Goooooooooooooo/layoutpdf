// Re-export the packaged worker entry so the bundler can emit a proper
// module worker chunk instead of inlining a data URL.
import '../../dist/pdf-worker.js';
