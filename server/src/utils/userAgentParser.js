/**
 * Lightweight, zero-dependency User-Agent parser for HMS Enterprise Auditing.
 * Extracts Browser, OS, and Device type from headers.
 *
 * @param {string} uaString - Raw user agent string
 * @returns {Object} { browser, os, device }
 */
function parseUserAgent(uaString) {
    if (!uaString) {
        return { browser: 'Unknown', os: 'Unknown', device: 'Desktop' };
    }

    let browser = 'Unknown Browser';
    let os = 'Unknown OS';
    let device = 'Desktop';

    // Device detection
    const uaLower = uaString.toLowerCase();
    if (/tablet|ipad|playbook|silk/i.test(uaLower)) {
        device = 'Tablet';
    } else if (/mobi|mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(uaLower)) {
        device = 'Mobile';
    }

    // OS detection
    if (/windows/i.test(uaString)) {
        os = 'Windows';
    } else if (/macintosh|mac os x/i.test(uaString)) {
        if (/iphone|ipad|ipod/i.test(uaString)) {
            os = 'iOS';
        } else {
            os = 'MacOS';
        }
    } else if (/iphone|ipad|ipod/i.test(uaString)) {
        os = 'iOS';
    } else if (/android/i.test(uaString)) {
        os = 'Android';
    } else if (/linux/i.test(uaString)) {
        os = 'Linux';
    }

    // Browser detection
    if (/edg/i.test(uaString)) {
        browser = 'Edge';
    } else if (/chrome|crios/i.test(uaString)) {
        if (/opr|opios/i.test(uaString)) {
            browser = 'Opera';
        } else {
            browser = 'Chrome';
        }
    } else if (/firefox|fxios/i.test(uaString)) {
        browser = 'Firefox';
    } else if (/safari/i.test(uaString)) {
        browser = 'Safari';
    } else if (/opr/i.test(uaString)) {
        browser = 'Opera';
    } else if (/msie|trident/i.test(uaString)) {
        browser = 'Internet Explorer';
    }

    return { browser, os, device };
}

module.exports = { parseUserAgent };
