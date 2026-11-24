import { DB_PATH } from '$app/env/private';
import { openDb } from './schema.ts';

export const db = openDb(DB_PATH);
