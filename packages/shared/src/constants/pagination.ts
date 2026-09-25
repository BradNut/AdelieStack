export const DEFAULT_PAGE = 1 as const;
export const DEFAULT_PAGE_SIZE = 10 as const;
export const MAX_PAGE_SIZE = 100 as const;
export const PAGINATION_SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const DEFAULT_SORT_DIRECTION = PAGINATION_SORT_DIRECTIONS[0];

// Query parameter keys
export const PAGINATION_PARAM_PAGE = 'page' as const;
export const PAGINATION_PARAM_PAGE_SIZE = 'pageSize' as const;
export const PAGINATION_PARAM_LIMIT = 'limit' as const;
export const PAGINATION_PARAM_DIRECTION = 'direction' as const;
export const PAGINATION_PARAM_ORDER_BY = 'orderBy' as const;

// Default sort field
export const DEFAULT_SORT_FIELD = 'id' as const;
