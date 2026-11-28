const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const CONTENT_DIR = path.join(__dirname, '..', 'content', 'du-an');
const OUTPUT_DIR = path.join(__dirname, '..', 'du-an');
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'project-detail.html');
const JSON_PATH = path.join(__dirname, '..', 'data', 'projects.json');
const SITEMAP_PATH = path.join(__dirname, '..', 'sitemap.xml');

function slugify(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'du-an';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Đảm bảo thư mục tồn tại
fs.mkdirSync(CONTENT_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Bước chuyển đổi tự động: Nếu content/du-an chưa có file nào nhưng data/projects.json có dữ liệu cũ thì tự tách thành các file .md
const existingMd = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));
if (existingMd.length === 0 && fs.existsSync(JSON_PATH)) {
  try {
    const oldData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
    const oldItems = oldData.items || [];
    oldItems.forEach((item, idx) => {
      const slug = slugify(item.title || `du-an-${idx + 1}`);
      const frontmatter = {
        title: item.title || `Dự án ${idx + 1}`,
        category: item.category || 'Nhà Phố',
        featured: item.featured !== false,
        client: item.client || '',
        area: item.area || '',
        address: item.address || '',
        date: '2026-11-28',
        cover: item.cover || '',
        description: `${item.title} tại ${item.address || 'Hà Nội'} (${item.area || ''}) do Ocean Home thiết kế và thi công trọn gói.`
      };
      const mdContent = matter.stringify(item.body || '', frontmatter);
      fs.writeFileSync(path.join(CONTENT_DIR, `${slug}.md`), mdContent, 'utf8');
    });
    console.log(`Đã tự động chuyển đổi ${oldItems.length} dự án cũ sang content/du-an/*.md`);
  } catch (err) {
    console.error('Lỗi chuyển đổi dữ liệu cũ:', err);
  }
}

// Đọc template HTML
const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
const mdFiles = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));

const projectList = [];
const activeHtmlFiles = new Set();

mdFiles.forEach(file => {
  const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
  const parsed = matter(raw);
  const data = parsed.data;
  const slug = path.basename(file, '.md');
  const htmlFileName = `${slug}.html`;
  activeHtmlFiles.add(htmlFileName);

  const title = data.title || 'Dự án Ocean Home';
  const category = data.category || 'Nhà Phố';
  const client = data.client || 'Chủ đầu tư';
  const address = data.address || 'Hà Nội';
  const area = data.area || '';
  const cover = (data.cover || '').replace(/^\/+/, '');
  const description = data.description || `${title} - Diện tích ${area} tại ${address}. Thiết kế & thi công trọn gói bởi Ocean Home.`;
  const dateStr = data.date ? String(data.date).slice(0, 10) : '2026-11-28';

  // Chuyển ảnh tương đối trong markdown thành ../images/... để hiển thị đúng trong thư mục /du-an/
  let bodyHtml = marked.parse(parsed.content || '');
  bodyHtml = bodyHtml.replace(/src="(?!https?:\/\/|\.\.\/|\/)([^"]+)"/g, 'src="../$1"');

  const finalHtml = template
    .replace(/\{\{TITLE\}\}/g, escapeHtml(title))
    .replace(/\{\{DESCRIPTION\}\}/g, escapeHtml(description))
    .replace(/\{\{SLUG\}\}/g, slug)
    .replace(/\{\{CATEGORY\}\}/g, escapeHtml(category))
    .replace(/\{\{CLIENT\}\}/g, escapeHtml(client))
    .replace(/\{\{ADDRESS\}\}/g, escapeHtml(address))
    .replace(/\{\{AREA\}\}/g, escapeHtml(area))
    .replace(/\{\{COVER\}\}/g, cover)
    .replace(/\{\{COVER_ENCODED\}\}/g, encodeURI(cover))
    .replace(/\{\{BODY_HTML\}\}/g, bodyHtml);

  fs.writeFileSync(path.join(OUTPUT_DIR, htmlFileName), finalHtml, 'utf8');

  projectList.push({
    slug,
    url: `du-an/${htmlFileName}`,
    title,
    category,
    featured: data.featured !== false,
    client: data.client || '',
    area,
    address,
    date: dateStr,
    cover,
    description
  });
});

// Dọn các file .html cũ trong du-an/ nếu bài đã bị xóa trong CMS
fs.readdirSync(OUTPUT_DIR).forEach(f => {
  if (f.endsWith('.html') && !activeHtmlFiles.has(f)) {
    fs.unlinkSync(path.join(OUTPUT_DIR, f));
  }
});

// Sắp xếp dự án mới nhất lên đầu
projectList.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

// Xuất lại data/projects.json để trang chủ và du-an.html đọc nhanh
fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
fs.writeFileSync(JSON_PATH, JSON.stringify({ items: projectList }, null, 2), 'utf8');

// Tự động cập nhật sitemap.xml
const today = new Date().toISOString().slice(0, 10);
const projectUrlsXml = projectList.map(p => `  <url>
    <loc>https://oceanhome.vn/du-an/${p.slug}.html</loc>
    <lastmod>${p.date || today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n');

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://oceanhome.vn/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://oceanhome.vn/du-an.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
${projectUrlsXml}
</urlset>
`;

fs.writeFileSync(SITEMAP_PATH, sitemapXml, 'utf8');
console.log(`Hoàn tất xuất ${projectList.length} trang HTML dự án tĩnh và cập nhật sitemap.xml!`);
