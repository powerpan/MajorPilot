import { stop } from './processes.mjs';
for (const name of ['admin', 'student', 'executor', 'backend', 'mailpit', 'redis', 'mysql']) await stop(name);
