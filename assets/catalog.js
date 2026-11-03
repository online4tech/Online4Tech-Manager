(() => {
  'use strict';

  const DATA_URL = 'https://raw.githubusercontent.com/online4tech/online4Tech/main/data/enigma2-plugins.json';
  const $ = id => document.getElementById(id);
  const state = { plugins: [], categories: [], category: '' };

  const categoryLabels = {
    IPTV: 'IPTV والبث', Audio: 'الصوتيات', Tools: 'الأدوات والأوامر',
    Skins: 'السكينات والثيمات', Translation: 'الترجمة واللغة',
    Panels: 'اللوحات', Other: 'متنوع', Picons: 'Picons والشعارات',
    Settings: 'الإعدادات', Softcam: 'Softcam'
  };

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
      commands.push({ label: 'أمر التثبيت أو التشغيل', command: plugin.installCommand.trim() });
    }
    if (Array.isArray(plugin.installCommands)) {
      plugin.installCommands.forEach((item, index) => {
        if (item && typeof item.command === 'string' && item.command.trim()) {
          commands.push({ label: String(item.label || ('طريقة إضافية ' + (index + 1))), command: item.command.trim() });
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
      status.textContent = 'تم النسخ — راجع المصدر والتوافق قبل الاستخدام.';
      button.disabled = true;
      window.setTimeout(() => { button.textContent = 'نسخ الأمر'; button.disabled = false; }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(done).catch(() => {
        if (fallback()) done();
        else status.textContent = 'تعذر النسخ تلقائياً؛ انسخ الأمر يدوياً.';
      });
    } else if (fallback()) done();
    else status.textContent = 'تعذر النسخ تلقائياً؛ انسخ الأمر يدوياً.';
  }

  function makePluginCard(plugin) {
    const card = make('article', 'catalog-plugin-card');
    const top = make('div', 'catalog-plugin-top');
    top.append(
      make('span', 'catalog-plugin-category', categoryLabels[plugin.category] || plugin.category || 'Enigma2'),
      make('span', 'catalog-plugin-version', plugin.version || 'الإصدار غير محدد')
    );
    const title = make('h3', '', plugin.name || plugin.slug || 'إضافة Enigma2');
    const description = make('p', 'catalog-plugin-description', plugin.description || 'لا يوجد وصف متاح لهذه الإضافة.');
    const meta = make('div', 'catalog-plugin-meta');
    if (plugin.developer) meta.append(make('span', '', 'المطور: ' + plugin.developer));
    const images = plugin.compatibility && Array.isArray(plugin.compatibility.images) ? plugin.compatibility.images.filter(Boolean) : [];
    meta.append(make('span', '', images.length ? 'صور النظام: ' + images.join('، ') : 'التوافق التفصيلي غير مؤكد'));
    card.append(top, title, description, meta);

    const commands = getCommands(plugin);
    if (commands.length) {
      card.append(make('div', 'catalog-command-title', 'الأوامر المتاحة'));
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
      card.append(make('p', 'catalog-no-command', 'لا يوجد أمر مثبت في سجل المكتبة. راجع المصدر لمعرفة التفاصيل.'));
    }

    const source = safeUrl(plugin.sourceUrl);
    if (source) {
      const link = make('a', 'catalog-source-link', 'فتح المصدر ↗');
      link.href = source;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      card.append(link);
    }
    return card;
  }

  function filteredPlugins() {
    const query = $('catalog-search').value.trim().toLocaleLowerCase();
    return state.plugins.filter(plugin => {
      const matchesCategory = !state.category || plugin.category === state.category;
      const searchable = [
        plugin.name, plugin.description, plugin.category, plugin.developer,
        ...(Array.isArray(plugin.tags) ? plugin.tags : [])
      ].join(' ').toLocaleLowerCase();
      return matchesCategory && (!query || searchable.includes(query));
    });
  }

  function renderCategoryNav(filtered) {
    const nav = $('catalog-category-nav');
    nav.replaceChildren();
    const counts = new Map();
    filtered.forEach(plugin => counts.set(plugin.category || 'Other', (counts.get(plugin.category || 'Other') || 0) + 1));

    const all = make('button', 'catalog-category-chip' + (!state.category ? ' is-active' : ''));
    all.type = 'button';
    all.append(document.createTextNode('كل الأنواع '));
    all.append(make('small', '', String(filtered.length)));
    all.addEventListener('click', () => { state.category = ''; $('catalog-category').value = ''; render(); });
    nav.append(all);

    state.categories.forEach(category => {
      const count = counts.get(category) || 0;
      if (!count) return;
      const chip = make('button', 'catalog-category-chip' + (state.category === category ? ' is-active' : ''));
      chip.type = 'button';
      chip.append(document.createTextNode((categoryLabels[category] || category) + ' '));
      chip.append(make('small', '', String(count)));
      chip.addEventListener('click', () => { state.category = category; $('catalog-category').value = category; render(); });
      nav.append(chip);
    });
  }

  function render() {
    const filtered = filteredPlugins();
    renderCategoryNav(filtered);
    const grid = $('catalog-plugin-grid');
    grid.replaceChildren();

    const categoriesToRender = state.category
      ? [state.category]
      : state.categories.filter(category => filtered.some(plugin => (plugin.category || 'Other') === category));

    categoriesToRender.forEach((category, index) => {
      const items = filtered.filter(plugin => (plugin.category || 'Other') === category);
      if (!items.length) return;
      const group = make('details', 'catalog-category-group');
      if (state.category || (!$('catalog-search').value.trim() && index === 0)) group.open = true;
      const summary = make('summary');
      const label = make('span');
      label.append(document.createTextNode(categoryLabels[category] || category));
      label.append(make('small', '', items.length + ' عنصر'));
      summary.append(label);
      group.append(summary);

      const cards = make('div', 'catalog-plugin-grid');
      items.forEach(plugin => cards.append(makePluginCard(plugin)));
      group.append(cards);
      grid.append(group);
    });

    $('catalog-count').textContent = 'عرض ' + filtered.length + ' عنصر من ' + state.plugins.length + ' في المكتبة';
    $('catalog-empty').hidden = filtered.length > 0;
  }

  function populateCategories(categories) {
    state.categories = categories.filter(Boolean);
    const select = $('catalog-category');
    select.replaceChildren(new Option('كل التصنيفات', ''));
    state.categories.forEach(category => select.append(new Option(categoryLabels[category] || category, category)));
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
      populateCategories(Array.isArray(data.categories) ? data.categories : [...new Set(state.plugins.map(item => item.category).filter(Boolean))]);
      $('catalog-source-date').textContent = data.updatedAt ? 'آخر تحديث للمصدر: ' + data.updatedAt : 'مصدر البيانات: Online4Tech';
      status.textContent = 'متصل بمكتبة Online4Tech — اختار النوع لعرض البلجنات والأوامر الخاصة به.';
      render();
    } catch (error) {
      status.textContent = 'تعذر تحميل المكتبة حالياً. تأكد من اتصال الإنترنت وحاول تحديث الصفحة. (' + error.message + ')';
      $('catalog-count').textContent = 'المكتبة غير متاحة';
      $('catalog-plugin-grid').replaceChildren();
      $('catalog-empty').hidden = false;
    }
  }

  $('catalog-search').addEventListener('input', render);
  $('catalog-category').addEventListener('change', () => { state.category = $('catalog-category').value; render(); });
  loadCatalog();
})();
