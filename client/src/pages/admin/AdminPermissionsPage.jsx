import React from 'react';
import UserPermissionManager from '../centraladmin/UserPermissionManager';

/**
 * AdminPermissionsPage — Dynamic Permission Assignment for Hospital Admin
 * Allows the hospital admin to grant/revoke individual permissions
 * for any staff member beyond their assigned role.
 */
const AdminPermissionsPage = () => {
    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <UserPermissionManager hospitals={[]} />
        </div>
    );
};

export default AdminPermissionsPage;
