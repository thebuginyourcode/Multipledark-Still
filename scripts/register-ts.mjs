// Lets Node load the app's extensionless TypeScript imports (used by scripts/).
import { register } from 'module';
register(new URL('./ts-resolve.mjs', import.meta.url));
