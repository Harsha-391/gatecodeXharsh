import React, { useState, useEffect } from 'react';
import UserPermissionManager from '../centraladmin/UserPermissionManager';
import { hospitalAPI } from '../../utils/api';

/**
 * AdminPermissionsPage — Dynamic Permission Assignment for Hospital Admin
 * Allows the hospital admin to grant/revoke individual permissions
 * for any staff member beyond their assigned role.
 */
const AdminPermissionsPage = () => {
    const [hospitalInfo, setHospitalInfo] = useState(null);

    useEffect(() => {
        const fetchMyHospital = async () => {
            try {
                const res = await hospitalAPI.getMyHospital();
                if (res.success && res.hospital) {
                    setHospitalInfo(res.hospital);
                }
            } catch (err) {
                console.error('Error fetching hospital info:', err);
            }
        };
        fetchMyHospital();
    }, []);

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <UserPermissionManager hospitals={hospitalInfo ? [hospitalInfo] : []} />
        </div>
    );
};

export default AdminPermissionsPage;
