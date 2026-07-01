import axios from 'axios';

/**
 * Fetches the active template for a given type, converts it to base64, and returns the settings.
 * @param {string} type - The template type (e.g. 'doctor_prescription', 'opd_bill', 'pharmacy_invoice', etc.)
 * @returns {Promise<{template: any, bgBase64: string|null}>}
 */
export const loadActiveTemplate = async (type) => {
    try {
        const token = localStorage.getItem('token');
        if (!token) return { template: null, bgBase64: null };
        
        const res = await axios.get(`/api/document-templates/active/${type}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.data?.success && res.data.template) {
            const template = res.data.template;
            if (template.url && !template.url.endsWith('.pdf')) {
                try {
                    const resp = await fetch(template.url);
                    const blob = await resp.blob();
                    const bgBase64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.readAsDataURL(blob);
                        reader.onloadend = () => resolve(reader.result);
                    });
                    return { template, bgBase64 };
                } catch (fetchErr) {
                    console.error('[loadActiveTemplate] Error converting template to base64:', fetchErr);
                    return { template, bgBase64: null };
                }
            }
            return { template, bgBase64: null };
        }
    } catch (err) {
        console.error(`[loadActiveTemplate] Failed to load template for ${type}:`, err);
    }
    return { template: null, bgBase64: null };
};
