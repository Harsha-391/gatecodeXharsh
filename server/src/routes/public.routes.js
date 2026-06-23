const express = require('express');
const router = express.Router();
const Service = require('../models/service.model');
const Doctor = require('../models/doctor.model');
const { getTenantConnection } = require('../db/tenantDb');
const { getTenantModels } = require('../db/tenantModels');
const Hospital = require('../models/hospital.model');

// Get all active services (public route)
router.get('/services', async (req, res) => {
  try {
    // Add cache headers for better performance (5 minutes cache)
    res.set('Cache-Control', 'public, max-age=300');

    let ServiceModel = Service;
    
    // Attempt to resolve hospital ID from request query params
    let hospitalId = req.query.hospitalId;

    if (!hospitalId && req.query.slug) {
      const hospital = await Hospital.findOne({ slug: req.query.slug.toLowerCase() }).select('_id').lean();
      if (hospital) {
        hospitalId = hospital._id;
      }
    }

    if (!hospitalId) {
      // Try to resolve from referer or origin headers
      const referer = req.headers.referer || req.headers.origin;
      if (referer) {
        try {
          const url = new URL(referer);
          const cleanDomain = url.hostname.toLowerCase();
          let query = {};
          if (cleanDomain.endsWith('.medicalhms.in')) {
            query.slug = cleanDomain.replace('.medicalhms.in', '');
          } else if (cleanDomain.endsWith('.boonkies.com')) {
            query.slug = cleanDomain.replace('.boonkies.com', '');
          } else if (cleanDomain.endsWith('.localhost')) {
            query.slug = cleanDomain.replace('.localhost', '');
          } else {
            const domainName = cleanDomain.startsWith('www.') ? cleanDomain.slice(4) : cleanDomain;
            query.customDomain = { $in: [domainName, `www.${domainName}`] };
          }
          const hospital = await Hospital.findOne(query).select('_id').lean();
          if (hospital) {
            hospitalId = hospital._id;
          }
        } catch (e) {
          // Ignore URL parsing errors
        }
      }
    }

    if (hospitalId) {
      try {
        const tenantDb = await getTenantConnection(String(hospitalId));
        if (tenantDb) {
          ServiceModel = getTenantModels(tenantDb).Service;
        }
      } catch (err) {
        console.error(`Error resolving tenant connection for hospital ${hospitalId} on public services fetch:`, err);
        // Fall back to Master DB Service model if tenant DB connection fails
      }
    }
    
    // Select only needed fields for better performance
    const services = await ServiceModel.find({ active: true })
      .select('id title description icon color price duration category features active')
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for better performance (returns plain JS objects)
    
    res.json({ 
      success: true, 
      services,
      count: services.length,
      cached: true
    });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ success: false, message: 'Error fetching services' });
  }
});

// Get tenant configuration by domain or slug for white-labeling
router.get('/tenant-config', async (req, res) => {
    try {
        const { domain, slug } = req.query;
        if (!domain && !slug) {
            return res.status(400).json({ success: false, message: 'Must provide domain or slug' });
        }

        const Hospital = require('../models/hospital.model');
        let query = {};
        
        if (domain) {
            // Remove protocol and trailing slash if mistakenly sent
            const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
            // Try to match customDomain directly. If it ends with .medicalhms.in, we can extract the slug.
            if (cleanDomain.endsWith('.medicalhms.in')) {
                query.slug = cleanDomain.replace('.medicalhms.in', '');
            } else if (cleanDomain.endsWith('.boonkies.com')) {
                query.slug = cleanDomain.replace('.boonkies.com', '');
            } else if (cleanDomain.endsWith('.localhost')) {
                query.slug = cleanDomain.replace('.localhost', '');
            } else {
                const domainName = cleanDomain.startsWith('www.') ? cleanDomain.slice(4) : cleanDomain;
                query.customDomain = { $in: [domainName, `www.${domainName}`] };
            }
        } else if (slug) {
            query.slug = slug.toLowerCase();
        }

        const hospital = await Hospital.findOne(query)
            .select('name slug customDomain branding')
            .lean();

        if (!hospital) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }

        // Add short cache only in production to prevent out-of-sync tenant IDs during local development/seeding
        if (process.env.NODE_ENV === 'production') {
            res.set('Cache-Control', 'public, max-age=600');
        } else {
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        }
        res.json({
            success: true,
            tenant: {
                id: hospital._id,
                name: hospital.name,
                slug: hospital.slug,
                customDomain: hospital.customDomain,
                branding: hospital.branding || {}
            }
        });
    } catch (err) {
        console.error('Get tenant-config error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

module.exports = router;


