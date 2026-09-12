document.addEventListener('DOMContentLoaded', () => {
  const scanBtn = document.getElementById('scanBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const resultsDiv = document.getElementById('results');
  const filterInput = document.getElementById('filter');
  const actionsDiv = document.querySelector('.actions');

  let foundImages = [];

  // Function to run in the context of the webpage
  function getLoadedImages() {
    const urls = new Set();
    
    // 1. Performance API (Network requests)
    const resources = performance.getEntriesByType('resource');
    for (const r of resources) {
      if (r.initiatorType === 'img' || r.initiatorType === 'css' || r.name.match(/\.(png|jpg|jpeg|webp|gif|svg|bmp|ico)(?:\?.*)?$/i)) {
        urls.add(r.name);
      }
    }

    // 2. DOM img tags
    for (const img of document.images) {
      if (img.src) urls.add(img.src);
    }

    // 3. CSS backgrounds
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      const bg = window.getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
        if (match && match[1]) {
          try {
            const url = new URL(match[1], window.location.href).href;
            urls.add(url);
          } catch(e) {}
        }
      }
    }

    // Return unique http/https URLs
    return Array.from(urls).filter(url => url.startsWith('http'));
  }

  scanBtn.addEventListener('click', async () => {
    resultsDiv.innerHTML = 'Scanning...';
    actionsDiv.style.display = 'none';
    foundImages = [];

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: getLoadedImages
      });

      if (results && results[0] && results[0].result) {
        let allUrls = results[0].result;
        const filterText = filterInput.value.trim().toLowerCase();
        
        if (filterText) {
          allUrls = allUrls.filter(url => url.toLowerCase().includes(filterText));
        }

        const uniqueUrls = [];
        const seenFilenames = new Set();
        
        for (const url of allUrls) {
          try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
            
            if (filename && !seenFilenames.has(filename)) {
              seenFilenames.add(filename);
              uniqueUrls.push(url);
            } else if (!filename && !seenFilenames.has(url)) {
              seenFilenames.add(url);
              uniqueUrls.push(url);
            }
          } catch (e) {
            if (!seenFilenames.has(url)) {
              seenFilenames.add(url);
              uniqueUrls.push(url);
            }
          }
        }

        foundImages = uniqueUrls;
        renderImages();
      }
    } catch (err) {
      resultsDiv.innerHTML = `Error: ${err.message}`;
    }
  });

  function renderImages() {
    resultsDiv.innerHTML = '';
    if (foundImages.length === 0) {
      resultsDiv.innerHTML = 'No images found matching the filter.';
      return;
    }

    actionsDiv.style.display = 'flex';
    foundImages.forEach((url, index) => {
      const div = document.createElement('div');
      div.className = 'image-item selected';
      
      const img = document.createElement('img');
      img.src = url;
      img.title = url;
      img.loading = 'lazy';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'checkbox';
      checkbox.checked = true;

      div.appendChild(checkbox);
      div.appendChild(img);

      div.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
          div.classList.add('selected');
        } else {
          div.classList.remove('selected');
        }
        updateSelectAllButton();
      });

      resultsDiv.appendChild(div);
    });
    updateSelectAllButton();
  }

  function updateSelectAllButton() {
    const items = document.querySelectorAll('.image-item input[type="checkbox"]');
    const allSelected = Array.from(items).every(cb => cb.checked);
    selectAllBtn.textContent = allSelected ? 'Deselect All' : 'Select All';
  }

  selectAllBtn.addEventListener('click', () => {
    const items = document.querySelectorAll('.image-item');
    const allSelected = Array.from(items).every(item => item.querySelector('input').checked);
    
    items.forEach(item => {
      const cb = item.querySelector('input');
      cb.checked = !allSelected;
      if (cb.checked) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
    updateSelectAllButton();
  });

  const downloadZipBtn = document.getElementById('downloadZipBtn');

  downloadBtn.addEventListener('click', () => {
    const selectedUrls = [];
    document.querySelectorAll('.image-item').forEach((item, index) => {
      if (item.querySelector('input').checked) {
        selectedUrls.push(foundImages[index]);
      }
    });

    if (selectedUrls.length > 0) {
      chrome.runtime.sendMessage({ action: 'downloadImages', urls: selectedUrls });
      const originalText = downloadBtn.textContent;
      downloadBtn.textContent = `Downloading ${selectedUrls.length}...`;
      setTimeout(() => { downloadBtn.textContent = originalText; }, 2000);
    }
  });

  downloadZipBtn.addEventListener('click', async () => {
    const selectedUrls = [];
    document.querySelectorAll('.image-item').forEach((item, index) => {
      if (item.querySelector('input').checked) {
        selectedUrls.push(foundImages[index]);
      }
    });

    if (selectedUrls.length > 0) {
      const originalText = downloadZipBtn.textContent;
      downloadZipBtn.textContent = `Zipping ${selectedUrls.length}...`;
      downloadZipBtn.disabled = true;

      try {
        const zip = new JSZip();
        const imgFolder = zip.folder("images");
        
        let count = 0;
        for (const url of selectedUrls) {
          try {
            const response = await fetch(url);
            const blob = await response.blob();
            
            let filename = "image_" + count;
            try {
              const urlObj = new URL(url);
              const pathParts = urlObj.pathname.split('/');
              const lastPart = pathParts[pathParts.length - 1];
              if (lastPart) {
                filename = lastPart;
              }
            } catch (e) {}

            // Ensure unique filename in zip
            const extensionMatch = filename.match(/\.[0-9a-z]+$/i);
            const extension = extensionMatch ? extensionMatch[0] : '.png';
            const baseName = filename.replace(/\.[0-9a-z]+$/i, '');
            
            // Just use the name, zip will overwrite if duplicate but we already deduplicated them!
            // However, it's safer to ensure uniqueness:
            let finalName = filename;
            if (imgFolder.file(finalName)) {
               finalName = `${baseName}_${count}${extension}`;
            }

            imgFolder.file(finalName, blob);
            count++;
            downloadZipBtn.textContent = `Zipping ${count}/${selectedUrls.length}...`;
          } catch (err) {
            console.error('Failed to fetch', url, err);
          }
        }

        downloadZipBtn.textContent = 'Generating ZIP...';
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        const zipUrl = URL.createObjectURL(zipBlob);
        
        // We use chrome.downloads to download the generated zip
        chrome.downloads.download({
          url: zipUrl,
          filename: 'downloaded_images.zip',
          saveAs: true
        }, () => {
           URL.revokeObjectURL(zipUrl);
        });

      } catch (e) {
        console.error('Zip generation failed', e);
      } finally {
        downloadZipBtn.textContent = originalText;
        downloadZipBtn.disabled = false;
      }
    }
  });
});
