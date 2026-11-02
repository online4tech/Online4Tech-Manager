(() => {
  'use strict';

  const DATA_URL = 'https://raw.githubusercontent.com/online4tech/online4Tech/main/data/enigma2-plugins.json';
  const $ = id => document.getElementById(id);
  const state = { plugins: [], category: '' };

  const safeUrl = value => {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' ? url.href : '';
    } catch (_) { return ''; }
  };

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function getCommands(plugin) {
    const commands = [];
    if (typeof plugin.installCommand === 'string' && plugin.installCommand.trim()) {
      commands.push({ label: 'أمر التثبيت الأساسي', command: plugin.installCommand.trim() });
    }
    if (Array.isArray(plugin.installCommands)) {
      plugin.installCommands.forEach((item, index) => {
        if (item && typeof item.command === 'string' && item.command.trim()) {
          commands.push({
            label: String(item.label || ('طريقة إضافية ' + (index + 1))),
            command: item.command.trim()
          });
        }
      });
    }
    return commands;
  }

  function copyText(value, button, status) {
    const fallback = () => {
      const field = make('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (_) {}
      field.remove();
      return copied;
    };
    const done = () => {
      button.textContent = '✓ تم النسخ';
      status.textContent = 'تم نسخ الأمر. راجع توافقه ومصدره قبل استخدامه.';
      button.disabled = true;
      window.setTimeout(() => {
        button.textContent = 'نسخ الأمر';
        button.disabled = false;
      }, 1600);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(done).catch(() => {
        if (fallback()) done();
        else status.textContent = 'تعذر النسخ تلقائياً؛ حدد الأمر وانسخه يدوياً.';
      });
    } else if (fallback()) done();
    else status.textContent = 'تعذر النسخ تلقائياً؛ حدد الأمر وانسخه يدوياً.';
  }

  function makePluginCard(plugin) {
    const card = make('article', 'catalog-plugin-card');
    const top = make('div', 'catalog-plugin-top');
    top.append(
      make('span', 'catalog-plugin-category', plugin.category || 'Enigma2'),
      make('span', 'catalog-plugin-version', plugin.version || 'الإصدار غير محدد')
    );
    const title = make('h3', '', plugin.name || plugin.slug || 'إضافة Enigma2');
    const description = make('p', 'catalog-plugin-description',
      plugin.description || 'لا يوجد وصف متاح لهذه الإضافة.');
    const meta = make('div', 'catalog-plugin-meta');
    if (plugin.developer) meta.append(make('span', '', 'المطور: ' + plugin.developer));
    const images = plugin.compatibility && Array.isArray(plugin.compatibility.images)
      ? plugin.compatibility.images.filter(Boolean) : [];
    meta.append(make('span', '', images.length ? 'صور مذكورة: ' + images.join('، ') : 'التوافق التفصيلي غير مؤكد'));
    card.append(top, title, description, meta);

    const commands = getCommands(plugin);
    if (commands.length) {
      const commandTitle = make('div', 'catalog-command-title', 'أوامر متاحة للنسخ');
      card.append(commandTitle);
      commands.forEach(item => {
        const block = make('div', 'catalog-command');
        const label = make('small', '', item.label);
        const code = make('pre', '', item.command);
        const actions = make('div', 'catalog-command-actions');
        const status = make('span', 'catalog-copy-status', '');
        const button = make('button', 'secondary catalog-copy-button', 'نسخ الأمر');
        button.type = 'button';
        button.addEventListener('click', () => copyText(item.command, button, status));
        actions.append(button, status);
        block.append(label, code, actions);
        card.append(block);
      });
    } else {
      card.append(make('p', 'catalog-no-command',
        'لا يوجد أمر تثبيت موثوق مسجل حالياً. استخدم صفحة المصدر لمعرفة طريقة التثبيت.'));
    }

    const source = safeUrl(plugin.sourceUrl);
    if (source) {
      const link = make('a', 'catalog-source-link', 'فتح المصدر الرسمي ↗');
      link.href = source;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      card.append(link);
    }
    return card;
  }

  function render() {
    const query = $('catalog-search').value.trim().toLocaleLowerCase();
    const filtered = state.plugins.filter(plugin => {
      const matchesCategory = !state.category || plugin.category === state.category;
      const searchable = [
        plugin.name, plugin.description, plugin.category, plugin.developer,
        ...(Array.isArray(plugin.tags) ? plugin.tags : [])
      ].join(' ').toLocaleLowerCase();
      return matchesCategory && (!query || searchable.includes(query));
    });

    const grid = $('catalog-plugin-grid');
    grid.replaceChildren();
    filtered.forEach(plugin => grid.append(makePluginCard(plugin)));
    $('catalog-count').textContent = 'عرض ' + filtered.length + ' من ' + state.plugins.length + ' إضافة';
    $('catalog-empty').hidden = filtered.length > 0;
  }

  function populateCategories(categories) {
    const select = $('catalog-category');
    categories.filter(Boolean).forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      select.append(option);
    });
  }

  async function loadCatalog() {
    const status = $('catalog-status');
    status.textContent = 'جاري تحميل مكتبة Online4Tech…';
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!data || !Array.isArray(data.plugins)) throw new Error('صيغة ملف البيانات غير متوقعة.');
      state.plugins = data.plugins.filter(item => item && typeof item === 'object' && item.name);
      populateCategories(Array.isArray(data.categories) ? data.categories : []);
      $('catalog-source-date').textContent = data.updatedAt
        ? 'آخر تحديث للمصدر: ' + data.updatedAt
        : 'مصدر البيانات: مكتبة Online4Tech';
      status.textContent = 'متصل بمصدر مكتبة Online4Tech — البيانات تُقرأ مباشرة ولا يتم تعديل الموقع الرئيسي.';
      render();
    } catch (error) {
      status.textContent = 'تعذر تحميل المكتبة حالياً. تأكد من اتصال الإنترنت وحاول تحديث الصفحة. (' + error.message + ')';
      $('catalog-count').textContent = 'المكتبة غير متاحة';
      $('catalog-plugin-grid').replaceChildren();
      $('catalog-empty').hidden = false;
    }
  }

  $('catalog-search').addEventListener('input', render);
  $('catalog-category').addEventListener('change', () => {
    state.category = $('catalog-category').value;
    render();
  });
  loadCatalog();
})();
