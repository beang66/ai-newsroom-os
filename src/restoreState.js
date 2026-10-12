// Shared flag: while a vault restore is in flight, nothing may write the old in-memory draft back.
let restoring = false;
export const isRestoring = () => restoring;
export const beginRestore = () => { restoring = true; };
export const endRestore = () => { restoring = false; };
