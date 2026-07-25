# Localization spec

> **Purpose**: This document is a prompt for an LLM agent to produce
> culturally-adapted localizations of the Text to .md Chrome extension.
> It is NOT a translation brief — it is a specification that ensures every string is adapted to feel native in the target language.
>
> **Naming note**: the store listing title is currently
> `HTML Text to .md — Online Markdown Web Clipper` (SEO-driven), while the
> in-product brand remains `to .md`. Where this spec says `appName`, it means
> the store title; the strings inside the UI still use `to .md`.

---

## 1. Product Context

**to .md** is a Chrome extension (MV3, Side Panel) that converts selected HTML into clean Markdown.

**User persona**: Technical writer, developer, note-taker, knowledge worker. They know what Markdown is. They are fast, keyboard-centric, clipboard-centric. They want a tool that stays out of the way.

**Brand voice (English baseline)**:
- Terse, not chatty
- Actionable, not descriptive
- Lower-case where appropriate (extension name is intentionally styled `to .md`)
- Em-dash as connective punctuation (not colon or semicolon)
- Emoji only in toast confirmations (single ✓)

---

## 2. Global Rules

### 2.1 DO NOT translate
| String key | Value | Reason |
|---|---|---|
| `appName` | `to .md` | Brand name. Never transliterate or adapt. |
| Any occurrence of `Markdown` | `Markdown` | Proper noun (technical term). |
| Any occurrence of `.md` | `.md` | File extension. |
| Any occurrence of `PDF` | `PDF` | Universal abbreviation. |
| Any occurrence of `URL` | `URL` | Universal abbreviation. |
| `✓` symbol in `toastCopied` | `✓` | Keep as-is. |
| Any occurrence of `EditMD` | `EditMD` | Product name of a separate app. Never transliterate. |

### 2.2 Placeholder `{1}`
The token `{1}` is a runtime substitution (a number). It MUST remain exactly as `{1}` in every locale. Position it where natural for the target language's word order.

### 2.3 Punctuation
- Use the **target language's native punctuation** rules (e.g., French non-breaking space before `—`, Japanese `…` as `…` not `...`, etc.).
- Preserve em-dashes (`—`) as the connective style. If the target language conventionally uses a different dash (e.g., CJK uses `——`), adapt.
- Ellipsis: use the single Unicode character `…` (U+2026), never three dots.

### 2.4 Length Constraints
Every UI string lives in a specific context. Respect the **max character guidance** column — it is not a hard pixel limit, but exceeding it significantly will break the layout.

### 2.5 Capitalization
- Follow the **target language's convention** for UI elements.
  - English: Sentence case for buttons/labels ("Capture selection"), Title Case avoided.
  - German: Nouns capitalized per grammar.
  - French: Sentence case; no Title Case on buttons.
  - Japanese/Chinese/Korean: N/A (no case).
  - Russian: Sentence case; infinitive form for buttons ("Захватить", not "Захват выделения").
- **Do not mimic English capitalization patterns** in languages that don't use them.

### 2.6 Formality Register
- Default register: **neutral-informal** (like a tool, not like a formal letter). 
- **Avoid** formal "you" where languages distinguish (use `ты`-register phrasing in Russian — but prefer **impersonal constructions** over direct address).
- Japanese: use です/ます level, not 敬語.
- Korean: 해요체.
- Adapt to what a popular native developer tool would sound like in that locale (e.g., VS Code, Notion, Telegram Desktop localizations are good references).

---

## 3. String Catalog — Key-by-Key Spec

Each entry below describes:
- **Where**: where in the UI the string appears
- **Function**: what the string communicates
- **Constraints**: length, formatting
- **Cultural adaptation notes**: what to watch for

---

### 3.1 Chrome Web Store & Manifest

#### `appName`
| | |
|---|---|
| **EN** | `to .md` |
| **Where** | CWS listing title, `chrome://extensions`, browser toolbar tooltip |
| **Function** | Brand identifier |
| **Constraint** | ≤ 45 chars (CWS limit). **Do not translate.** |
| **Note** | Always `to .md`. In `description` field, you may add a parenthetical native-language explanation if helpful for discoverability, e.g., in CJK markets. |

#### `appDescription`
| | |
|---|---|
| **EN** | `Convert selected text to clean, formatted Markdown — one click from selection to clipboard.` |
| **Where** | CWS listing short description, `chrome://extensions` page |
| **Function** | Elevator pitch. Must sell the extension in one line. |
| **Constraint** | ≤ 132 chars (CWS limit). Every character counts for discoverability. |
| **Adaptation** | This is a **marketing micro-copy**, not a feature description. Adapt to what sounds compelling and natural in the target market. Prioritize: (1) the core value proposition ("selection → Markdown → clipboard"), (2) speed/simplicity, (3) native phrasing that would make a local user click "Add to Chrome". A literal translation will sound awkward — rewrite freely. |

---

### 3.2 Primary Action Buttons

These are the main interactive controls in the Side Panel. They must be **short, imperative, and instantly scannable**.

#### `captureSelection`
| | |
|---|---|
| **EN** | `Capture selection` |
| **Where** | Primary CTA button in Side Panel |
| **Function** | Triggers HTML-to-Markdown conversion of the current browser selection |
| **Constraint** | ≤ 20 chars ideally. This is the largest button; slightly longer is OK. |
| **Adaptation** | The word "capture" here means "grab and convert". Don't use words that imply screenshot, recording, or saving to disk. The action is: take what's selected → produce Markdown. Use the most natural short verb for this in the target language. **Russian locale decision**: use «Скопировать выделенное» — the verb «захватить» sounds aggressive/military; «скопировать» is the standard clipboard verb and instantly understood. Prefer infinitive form on buttons. |

#### `captureHighlights`
| | |
|---|---|
| **EN** | `Capture highlights ({1})` |
| **Where** | Alternative CTA button, shown when highlighter mode has elements marked |
| **Function** | Converts all highlighted elements to Markdown. `{1}` = number of highlighted items. |
| **Constraint** | ≤ 30 chars (excluding `{1}` placeholder). |
| **Adaptation** | "Highlights" here means elements the user clicked to mark on the page (visual highlighter feature), NOT text selection highlights. Use terminology consistent with a physical highlighter marker pen metaphor. |

#### `clear`
| | |
|---|---|
| **EN** | `Clear` |
| **Where** | Small button to clear the Markdown output area |
| **Function** | Erases all content from the Side Panel editor |
| **Constraint** | ≤ 10 chars. Keep as short as possible. |
| **Adaptation** | Standard "Clear" button. Use what native apps use for clearing a text field. |

#### `copy`
| | |
|---|---|
| **EN** | `Copy` |
| **Where** | Button to copy Markdown to clipboard |
| **Constraint** | ≤ 12 chars. |
| **Adaptation** | Standard clipboard copy verb. Match OS-level terminology (e.g., macOS/Windows context menu phrasing in that locale). |

#### `copied`
| | |
|---|---|
| **EN** | `Copied` |
| **Where** | Replaces `copy` button text momentarily after successful copy |
| **Function** | Confirmation micro-state (shows for ~1.5s, then reverts) |
| **Constraint** | ≤ 12 chars. Should be same or shorter than `copy`. |
| **Adaptation** | Past-tense or completion form of the copy verb. Must feel like a quick "done!" confirmation, not a sentence. |

#### `download`
| | |
|---|---|
| **EN** | `Download` |
| **Where** | Button to save Markdown as a `.md` file |
| **Constraint** | ≤ 12 chars. |
| **Adaptation** | Standard file-download verb. Match browser's native download terminology. |

---

### 3.3 View Mode Toggle

#### `preview`
| | |
|---|---|
| **EN** | `Preview` |
| **Where** | Tab/toggle to show rendered Markdown (HTML preview) |
| **Constraint** | ≤ 14 chars. |
| **Adaptation** | Standard "preview" as in "rendered view". Not "pre-view" in the temporal sense. Match what code editors call this (e.g., VS Code "Preview" pane). |

#### `source`
| | |
|---|---|
| **EN** | `Source` |
| **Where** | Tab/toggle to show raw Markdown source text |
| **Constraint** | ≤ 14 chars. |
| **Adaptation** | Means "source code" / "raw text". Not "origin" or "provenance". Match developer tool terminology (like "View Source" in browsers). |

---

### 3.4 Highlighter Feature

The highlighter is a mode where the user clicks DOM elements on the page to mark them (like highlighting with a marker pen). The highlighted elements can then be batch-captured as Markdown.

#### `highlighterOn`
| | |
|---|---|
| **EN** | `Highlighter on` |
| **Where** | Toggle state label in Side Panel |
| **Constraint** | ≤ 16 chars. |
| **Adaptation** | Metaphor = marker pen / text highlighter. "On" = active state. Keep terse — this is a state indicator, not a button label. |

#### `highlighterOff`
| | |
|---|---|
| **EN** | `Highlighter off` |
| **Where** | Toggle state label in Side Panel |
| **Constraint** | ≤ 16 chars. |
| **Adaptation** | Same as above, "off" = inactive state. |

#### `highlights`
| | |
|---|---|
| **EN** | `{1} highlights — ready to capture` |
| **Where** | Status line shown when highlighter has marked elements |
| **Function** | Tells the user how many elements are highlighted and that they can proceed |
| **Constraint** | ≤ 40 chars. `{1}` = count. |
| **Adaptation** | Must handle plural forms. Some languages (Russian, Polish, Arabic) have complex plural rules — use whichever single form covers "N items" naturally. Chrome i18n does NOT support ICU plural syntax, so pick the most universally understandable phrasing (e.g., Russian: `{1} эл.` with abbreviation, or `{1} — готово к захвату` avoiding the noun entirely). |

#### `statusHighlighterReady`
| | |
|---|---|
| **EN** | `Click elements on the page to highlight` |
| **Where** | Status bar hint when highlighter is active but nothing is highlighted yet |
| **Constraint** | ≤ 50 chars. |
| **Adaptation** | Instructional micro-copy. "Click" = mouse click on page elements. Keep as a short instruction. Impersonal form preferred ("Click elements…" not "You can click…"). |

---

### 3.5 Placeholder & Counter

#### `markdownPlaceholder`
| | |
|---|---|
| **EN** | `Markdown will appear here…` |
| **Where** | Ghost text in the empty Markdown output area |
| **Constraint** | ≤ 35 chars. |
| **Adaptation** | Standard placeholder pattern. Should sound natural as grey placeholder text. End with `…`. |


---

### 3.6 Status Messages

These appear in a status bar area. They describe the current page/tab state. Terse, no full sentences needed.

#### `statusEmpty`
| | |
|---|---|
| **EN** | `Empty tab` |
| **Constraint** | ≤ 15 chars. |
| **Adaptation** | The browser tab has no content (e.g., `about:blank`). |

#### `statusRestricted`
| | |
|---|---|
| **EN** | `Restricted page` |
| **Constraint** | ≤ 20 chars. |
| **Adaptation** | The page is a Chrome internal page (like `chrome://settings`) where content scripts can't run. |

#### `statusLocalFile`
| | |
|---|---|
| **EN** | `Local file` |
| **Constraint** | ≤ 15 chars. |
| **Adaptation** | A `file://` URL. |

#### `statusPdf`
| | |
|---|---|
| **EN** | `PDF — cannot capture` |
| **Constraint** | ≤ 25 chars. |
| **Adaptation** | The tab has a PDF. Explain briefly it can't be captured. Keep `PDF` untranslated. |

#### `statusReady`
| | |
|---|---|
| **EN** | `Ready to capture — select text and click Capture` |
| **Where** | Default status when extension is ready |
| **Constraint** | ≤ 55 chars. |
| **Adaptation** | Instructional hint. Guide the user on what to do next. The word "Capture" at the end should match the label of the `captureSelection` button in this locale so the user connects the instruction to the UI element. |

---

### 3.7 Error Messages

Errors are shown in the status bar or as inline messages. They should be:
- **Concise**: no filler words
- **Actionable**: if the user can fix it, say what to do
- **Not scary**: avoid "Error!", "Failed!", exclamation marks. Use calm, factual tone.

#### `errCannotAccess`
| | |
|---|---|
| **EN** | `Cannot access this tab.` |
| **Constraint** | ≤ 30 chars. |
| **Cause** | Tab is a Chrome internal page, devtools, etc. |

#### `errCannotInject`
| | |
|---|---|
| **EN** | `Could not inject into this page.` |
| **Constraint** | ≤ 40 chars. |
| **Cause** | Content script injection failed. |
| **Adaptation** | "Inject" is technical. In user-facing text, prefer a phrase that means "connect to" or "access" the page. Don't expose the technical mechanism. |

#### `errRestrictedUrl`
| | |
|---|---|
| **EN** | `Cannot capture from this page (restricted URL).` |
| **Constraint** | ≤ 55 chars. |
| **Adaptation** | Keep the parenthetical explanation. "Restricted URL" can be adapted to "protected address" or similar if "URL" isn't common in the target locale. In most technical locales, keep `URL`. |

#### `errTimeout`
| | |
|---|---|
| **EN** | `Request timed out. Try again.` |
| **Constraint** | ≤ 35 chars. |
| **Adaptation** | Two short sentences. Cause + action. |

#### `errConnect`
| | |
|---|---|
| **EN** | `Could not connect to page. Reload and try again.` |
| **Constraint** | ≤ 55 chars. |
| **Adaptation** | User-actionable: reload the page. "Reload" should match the browser's reload button label in the target locale. |

#### `errNoHighlights`
| | |
|---|---|
| **EN** | `No highlights. Click elements on the page to highlight them.` |
| **Constraint** | ≤ 65 chars. |
| **Adaptation** | The user tried to capture highlights but none were marked. Instruction to fix. |

#### `errNoSelection`
| | |
|---|---|
| **EN** | `No text selected. Select text on the page first.` |
| **Constraint** | ≤ 55 chars. |
| **Adaptation** | The user clicked Capture but nothing was selected. |

#### `errConvertFailed`
| | |
|---|---|
| **EN** | `Could not convert selection.` |
| **Constraint** | ≤ 35 chars. |
| **Adaptation** | Generic conversion failure. Keep vague — the user can't fix this. |

#### `errClipboard`
| | |
|---|---|
| **EN** | `Could not copy to the clipboard.` |
| **Where** | Status bar, after Copy, Copy `.txt` or Send to EditMD |
| **Constraint** | ≤ 40 chars. |
| **Cause** | Chrome refused the clipboard write, normally because the panel did not have focus. |
| **Adaptation** | Say that the copy did not happen, not why — the user recovers by clicking in the panel and trying again. Use the target locale's usual word for the system clipboard. |

#### `errEditmdOpen`
| | |
|---|---|
| **EN** | `Could not open EditMD.` |
| **Where** | Status bar, after Send to EditMD |
| **Constraint** | ≤ 30 chars. |
| **Cause** | The `editmd://` hand-off was refused by the browser; usually EditMD is not installed. |
| **Adaptation** | Keep `EditMD` untranslated. Calm and factual — do not add "install it first", the extension cannot tell whether it is installed. |

---

### 3.8 Success Messages

#### `successCaptured`
| | |
|---|---|
| **EN** | `Captured.` |
| **Where** | Status bar, after successful conversion |
| **Constraint** | ≤ 12 chars. End with period. |
| **Adaptation** | Minimal confirmation. One word + period. Must feel like a quick "done." |

#### `copiedTxt`
| | |
|---|---|
| **EN** | `Plain text copied` |
| **Where** | Status bar, after Copy `.txt` |
| **Constraint** | ≤ 25 chars. |
| **Adaptation** | "Plain text" means Markdown syntax stripped. Use the same wording as `tooltipCopyTxt` in this locale. No period — it is a transient confirmation. |

#### `openingEditmd`
| | |
|---|---|
| **EN** | `Opening in EditMD…` |
| **Where** | Status bar, right after Send to EditMD |
| **Constraint** | ≤ 25 chars. Keep the trailing `…` (U+2026). |
| **Adaptation** | Keep `EditMD` untranslated. Present progressive: the hand-off was started, and the extension never learns whether it arrived, so do not phrase it as completed ("Opened"). |

---

### 3.9 Toast Notifications

Toasts appear as small overlays near the selection on the web page. Ultra-compact.

#### `toastNoSelection`
| | |
|---|---|
| **EN** | `No text selected` |
| **Constraint** | ≤ 20 chars. |

#### `toastCopied`
| | |
|---|---|
| **EN** | `Copied as Markdown ✓` |
| **Constraint** | ≤ 25 chars. Keep `✓` at the end. Keep `Markdown` untranslated. |

#### `toastCouldNotCopy`
| | |
|---|---|
| **EN** | `Could not copy` |
| **Constraint** | ≤ 20 chars. |

---

### 3.10 Floating Bubble

#### `bubbleText`
| | |
|---|---|
| **EN** | `add to .md` |
| **Where** | Small floating button that appears near the user's selection on a web page |
| **Function** | Quick-action trigger: click to capture selection to Markdown |
| **Constraint** | ≤ 14 chars. As short as possible — this is a tiny pill-shaped element. |
| **Adaptation** | Intentionally lowercase in English. Keep lowercase if the target language allows it. The `.md` part is the file extension — keep as-is. The phrase should feel like a quick label, not a sentence. |

---

### 3.11 Context Menu

#### `contextMenuTitle`
| | |
|---|---|
| **EN** | `add to .md` |
| **Where** | Right-click context menu item |
| **Constraint** | ≤ 20 chars. |
| **Adaptation** | Same phrasing as `bubbleText` for consistency. Lowercase if culturally appropriate. Must fit naturally among other context menu items (which are typically sentence-cased in the OS). If the target OS locale uses Title Case for context menus, adapt case accordingly. |

---

### 3.12 Settings Page

Settings appear on a dedicated `options.html` page. Labels can be longer. Use natural-sounding form labels.

#### `settingsTitle`
| | |
|---|---|
| **EN** | `to .md — Settings` |
| **Where** | `<title>` of the settings page (browser tab title) |
| **Constraint** | ≤ 40 chars. |
| **Adaptation** | Brand name + localized "Settings". Keep `to .md` untranslated. Use em-dash separator. Match what the target locale uses for "Settings" in browser/OS UI. |

#### `settingsH1`
| | |
|---|---|
| **EN** | `to .md Settings` |
| **Where** | Main heading on the settings page |
| **Constraint** | ≤ 25 chars. |

#### Section headings: `sectionCapture`, `sectionDisplay`, `sectionHighlighter`, `sectionLanguage`
| | |
|---|---|
| **EN** | `Capture` / `Display` / `Highlighter` / `Language` |
| **Where** | Section headings grouping related settings |
| **Constraint** | ≤ 15 chars each. |
| **Adaptation** | Single-word nouns preferred. These are category labels, not sentences. |

#### `labelAutoMetadata`
| | |
|---|---|
| **EN** | `Auto-add metadata on capture` |
| **Where** | Checkbox/toggle label |
| **Constraint** | ≤ 40 chars. |
| **Adaptation** | "Metadata" = YAML frontmatter (title, URL, date). The user might not know what YAML is — "metadata" is sufficient. "Auto-add" = automatically insert without asking. "On capture" = every time a capture happens. |

#### `labelShowBubble`
| | |
|---|---|
| **EN** | `Show floating bubble on selection` |
| **Where** | Checkbox/toggle label |
| **Constraint** | ≤ 40 chars. |
| **Adaptation** | "Floating bubble" = a small pill-shaped button that appears near the cursor when the user selects text. Describe what the user sees, not the technical mechanism. |

#### `labelDefaultView`
| | |
|---|---|
| **EN** | `Default view mode` |
| **Where** | Dropdown/radio label |
| **Constraint** | ≤ 25 chars. |

#### `labelHighlightColor`
| | |
|---|---|
| **EN** | `Highlight color` |
| **Where** | Color picker label |
| **Constraint** | ≤ 20 chars. |

#### `labelLanguage`
| | |
|---|---|
| **EN** | `Language` |
| **Where** | Language selector label |
| **Constraint** | ≤ 15 chars. |

#### Options: `optPreview`, `optSource`, `optAuto`
| | |
|---|---|
| **EN** | `Preview` / `Source` / `Auto (browser language)` |
| **Where** | Dropdown/radio options for `labelDefaultView` and `labelLanguage` |
| **Constraint** | ≤ 25 chars for `optAuto`. |
| **Adaptation** | `optPreview` and `optSource` must match `preview` and `source` toggle labels. `optAuto` should explain it follows the browser's language setting. |

#### `savedSettings`
| | |
|---|---|
| **EN** | `Saved.` |
| **Where** | Brief confirmation after settings are saved |
| **Constraint** | ≤ 12 chars. |
| **Adaptation** | Minimal. One word + period. Same energy as `successCaptured`. |

---

### 3.13 Toolbar Tooltips

These are the accessible names of the export buttons, shown in the status bar on
hover. They are also what a screen reader announces, and in the compact toolbar —
where the visible labels are dropped — they are the only thing naming the button.
So they must say what the button *does*, never repeat the icon.

#### `tooltipCopyMd`
| | |
|---|---|
| **EN** | `Copy as Markdown` |
| **Constraint** | ≤ 30 chars. Keep `Markdown` untranslated. |
| **Adaptation** | Verb phrase. The verb should match the `copy` button label in this locale. |

#### `tooltipDownloadMd`
| | |
|---|---|
| **EN** | `Download Markdown file` |
| **Constraint** | ≤ 35 chars. Keep `Markdown` untranslated. |
| **Adaptation** | Verb should match the `download` button label in this locale. |

#### `tooltipCopyTxt`
| | |
|---|---|
| **EN** | `Copy as plain text` |
| **Constraint** | ≤ 30 chars. |
| **Adaptation** | "Plain text" = Markdown syntax stripped. Keep consistent with `copiedTxt` and `tooltipDownloadTxt`. |

#### `tooltipDownloadTxt`
| | |
|---|---|
| **EN** | `Download plain text file` |
| **Constraint** | ≤ 35 chars. |
| **Adaptation** | Same "plain text" wording as `tooltipCopyTxt`. |

#### `tooltipTxtMenu`
| | |
|---|---|
| **EN** | `Plain text options` |
| **Where** | The `.txt` button, which opens a menu of two items |
| **Constraint** | ≤ 30 chars. |
| **Adaptation** | The button's visible label is the literal `.txt`, which is never translated — this string is what names it for assistive tech. Describe the menu, not the file extension. |

#### `tooltipSendEditmd`
| | |
|---|---|
| **EN** | `Send to EditMD` |
| **Where** | The EditMD button, whose visible label is the bare brand name |
| **Constraint** | ≤ 30 chars. Keep `EditMD` untranslated. |
| **Adaptation** | Names the action the brand alone does not. macOS-only button, absent on other platforms — still translate it. |

---

### 3.14 Rating Widget

A row at the bottom of the side panel, shown after the user has captured a few
times, asking for a Web Store review.

#### `sectionRating`
| | |
|---|---|
| **EN** | `Rate this extension` |
| **Constraint** | ≤ 30 chars. |
| **Adaptation** | An invitation, not a demand. Avoid exclamation marks and "please". |

#### `ratingHide`
| | |
|---|---|
| **EN** | `Hide` |
| **Where** | Dismisses the rating row for good |
| **Constraint** | ≤ 12 chars. |
| **Adaptation** | Single word if the language allows. Neutral — it is a dismissal, not a refusal. |

---

## 4. Quality Checklist for Each Locale

Before delivering a locale file, the translator (human or LLM) must verify:

- [ ] `appName` is exactly `to .md` (not translated)
- [ ] `Markdown`, `.md`, `PDF`, `URL`, `EditMD` are NOT translated
- [ ] `{1}` placeholder is present and correctly positioned
- [ ] `✓` is present in `toastCopied`
- [ ] No string exceeds its character constraint by more than 20%
- [ ] `captureSelection` button label and the word "Capture" in `statusReady` are **consistent** (same verb)
- [ ] `optPreview`/`optSource` match `preview`/`source` toggle labels exactly
- [ ] `bubbleText` and `contextMenuTitle` use the same phrasing
- [ ] Punctuation follows target-language rules (quotes, dashes, ellipsis, spacing)
- [ ] Register is consistent (no mixing formal/informal address)
- [ ] Error messages are calm, actionable, not alarmist
- [ ] All strings sound like they belong in a native app, not a translated one

---

## 5. Reference Translations to Audit

Below is the current Russian (`ru`) translation for audit against these rules. The same audit framework applies to all future locales.

### Known issues in current `ru` locale:

| Key | Current RU | Issue | Suggested fix direction |
|---|---|---|---|
| `captureSelection` | `Захватить выделение` | "Захватить" has aggressive connotation (seize/capture physically). | **RESOLVED** → `Скопировать выделенное`. The verb «скопировать» is the standard clipboard verb. All downstream strings (`statusReady`, `sectionCapture`, `captureHighlights`, `labelAutoMetadata`, `statusPdf`, `errRestrictedUrl`) updated to use «копировать/копирование» consistently. |
| `highlights` | `{1} элемент(ов) — готово к захвату` | `элемент(ов)` is a parenthetical hack for plurals; looks unpolished. | **RESOLVED** → `Выделено: {1} — готово к копированию`. Restructured to avoid plural noun entirely. |
| `errCannotInject` | `Не удалось внедриться на страницу.` | "Внедриться" (infiltrate) sounds like malware. | **RESOLVED** → `Не удалось подключиться к странице.` |
| `labelShowBubble` | `Показывать всплывающую подсказку при выделении` | "Всплывающая подсказка" = tooltip, not a floating bubble. Misleading. | **RESOLVED** → `Показывать кнопку при выделении текста`. |
| `statusReady` | `Готово к захвату — выделите текст и нажмите Захватить` | Must ensure the CTA verb matches `captureSelection` button label. | **RESOLVED** → `Выделите текст и нажмите Скопировать`. Matches button label. |
| `appDescription` | Literal translation of English structure. | Sounds like a translated string, not a native CWS pitch. | **RESOLVED** → `Выделение → Markdown → буфер обмена. Один клик — и готово.` |
| `errNoHighlights` | `Нет выделений.` | Sounds bureaucratic/formal. | **RESOLVED** → `Ничего не выделено.` Natural impersonal construction. |

---

## 6. How to Use This Prompt

### For LLM-based localization:

```
You are localizing the Chrome extension "to .md" into {TARGET_LANGUAGE}.

Read the localization spec at docs/localization.md (attached).

Input: the English messages.json (attached).
Output: a complete {TARGET_LOCALE}/messages.json file.

Rules:
1. Follow EVERY key-specific instruction in Section 3.
2. Pass the quality checklist in Section 4.
3. Do NOT translate literally. Adapt culturally.
4. Match the brand voice: terse, calm, developer-friendly.
5. Output valid JSON only, matching the Chrome i18n messages.json schema.
```

### For human translators:

Provide this document as a reference alongside the English `messages.json`. Ask them to fill in a spreadsheet with columns: `key`, `en`, `{locale}`, `notes`. Review against Section 4 checklist.

---

## 7. Supported Locales Roadmap

Priority order for localization:

| Tier | Locales | Rationale |
|---|---|---|
| 1 (MVP) | `en`, `ru`, `de`, `ja`, `zh_CN`, `ko`, `fr`, `es`, `pt_BR` | Covers ~80% of CWS developer audience |
| 2 | `it`, `pl`, `uk`, `tr`, `nl`, `cs`, `vi` | Growing dev markets |
| 3 | Remaining CWS-supported locales | Long tail |
