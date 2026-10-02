import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const distUrl = (file: string) => pathToFileURL(resolve('dist', file)).href;
