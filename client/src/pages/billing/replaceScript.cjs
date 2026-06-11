const fs = require('fs');
const file = 'c:/Users/omris/Downloads/HMS-main/HMS-main/client/src/pages/billing/BillingDashboard.jsx';
let content = fs.readFileSync(file, 'utf8');

// Add helper
const helper = `
const getAdmAmt = (a) => {
    if (!a) return 0;
    if (a.totalAmount > 0) return a.totalAmount;
    const days = Math.max(1, Math.floor((new Date() - new Date(a.admissionDate)) / (1000 * 60 * 60 * 24)));
    return (a.dailyWardCharge || 0) * days;
};
`;
content = content.replace('const fmt = (n)', helper + '\nconst fmt = (n)');

// Replace in specific lines
content = content.replace(/billing\.admissions\.filter\((.*?)\)\.forEach\(a => total \+= \(a\.totalAmount \|\| 0\)\);/g, 'billing.admissions.filter($1).forEach(a => total += getAdmAmt(a));');
content = content.replace(/unitPrice: a\.totalAmount \|\| 0/g, 'unitPrice: getAdmAmt(a)');

content = content.replace(/<strong>{fmt\(a\.totalAmount\)}<\/strong>/g, '<strong>{fmt(getAdmAmt(a))}</strong>');
content = content.replace(/<strong className="amount-val">{fmt\(a\.totalAmount\)}<\/strong>/g, '<strong className="amount-val">{fmt(getAdmAmt(a))}</strong>');

content = content.replace(/const total = \(billing\.admissions \|\| \[\]\)\.reduce\(\(s, a\) => s \+ \(a\.totalAmount \|\| 0\), 0\);/g, 'const total = (billing.admissions || []).reduce((s, a) => s + getAdmAmt(a), 0);');
content = content.replace(/const paid  = \(billing\.admissions \|\| \[\]\)\.filter\(a => a\.paymentStatus === 'Paid'\)\.reduce\(\(s, a\) => s \+ \(a\.totalAmount \|\| 0\), 0\);/g, 'const paid  = (billing.admissions || []).filter(a => a.paymentStatus === \'Paid\').reduce((s, a) => s + getAdmAmt(a), 0);');

content = content.replace(/<span>{fmt\(a\.totalAmount \|\| 0\)}<\/span>/g, '<span>{fmt(getAdmAmt(a))}</span>');

content = content.replace(/\.\.\.\(billing\.admissions \|\| \[\]\)\.map\(a => a\.totalAmount \|\| 0\)/g, '...(billing.admissions || []).map(a => getAdmAmt(a))');
content = content.replace(/\.\.\.\(billing\.admissions \|\| \[\]\)\.filter\(a => a\.paymentStatus === 'Paid'\)\.map\(a => a\.totalAmount \|\| 0\)/g, '...(billing.admissions || []).filter(a => a.paymentStatus === \'Paid\').map(a => getAdmAmt(a))');

fs.writeFileSync(file, content);
console.log('Replaced successfully');
