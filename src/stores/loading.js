import { writable } from 'svelte/store';

const globalLoading = writable(true);
export { globalLoading };