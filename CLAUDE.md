  Chrome Extension для захвата выделений со страниц в Markdown.                                                                                                                                                               
  Ядро конвертации — внешняя библиотека `@markitdown/core`.        
                                                                                                                                                                                                                              
  ## Архитектура                                                   
                                                                                                                                                                                                                              
  - **Content script** — захватывает `window.getSelection()` через `selectionToMarkdown()`                                                                                                                                    
  - **Popup** — UI, триггерит захват через `chrome.tabs.sendMessage`
  - **Background (service worker)** — координация; конвертация произвольного HTML через Offscreen API                                                                                                                         
  - **Offscreen document** — запускает `toMarkdown()` там, где есть DOM                                                                                                                                                       
                                                                                                                                                                                                                              
  Подробности интеграции с библиотекой: [docs/CHROME_EXTENSION.md]                                                                                                                                              
                                                                                                                                                                                                                  
  ## Ключевые зависимости                                                                                                                                                                                                     
                                                                                                                                                                                                                              
  - `@markitdown/core` — HTML→Markdown                                                                                                                                                                                        
  - Manifest V3
