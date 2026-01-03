export type UserRole = 'admin' | 'gestor' | 'vendedor' | 'cliente';

export const USER_ROLES: UserRole[] = ['admin', 'gestor', 'vendedor', 'cliente'];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
    admin: 'Admin',
    gestor: 'Gestor de Tráfego',
    vendedor: 'Vendedor',
    cliente: 'Cliente',
};
