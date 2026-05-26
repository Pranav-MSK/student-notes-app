// Global Application State Matrix
let notes = [];
const THEME_KEY = "theme";
const AUTO_SAVE_KEY = 'draft';
const AUTO_SAVE_DELAY = 2000; 
const TAGS_KEY = 'allTags';

let autoSaveTimer = null;
let searchQuery = "";
let filterTags = [];
let filterSubject = "";
let globalTags = [];

// Structural Models
let folders = JSON.parse(localStorage.getItem('folders')) || [];
let currentFolder = null; 
let subjects = JSON.parse(localStorage.getItem('subjects')) || {};
let attendance = JSON.parse(localStorage.getItem('attendance')) || {};
let assignments = JSON.parse(localStorage.getItem('assignments')) || [];

// Temporary in-memory array to manage custom sub-sections before creating a note
let activeNoteSections = [];

// Core Initialization Engine
document.addEventListener('DOMContentLoaded', () => {
    // Synchronize notes data schemas first
    loadNotesFromStorage();
    initTheme();

    // Elements Selectors
    const searchInput = document.getElementById('searchInput');
    const filterTagsInput = document.getElementById('filterTags');
    const filterSubjectSelect = document.getElementById('filterSubject');
    const noteInput = document.getElementById('noteInput');
    const titleInput = document.getElementById('noteTitle');
    const tagsInput = document.getElementById('noteTags');
    const subjectInput = document.getElementById('noteSubject');

    // Attach Event Routing
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            displayNotes();
        });
    }

    if(filterTagsInput) {
        filterTagsInput.addEventListener('input', (e) => {
            const txt = e.target.value.trim();
            filterTags = txt ? txt.split(',').map(t => t.trim()).filter(Boolean) : [];
            displayNotes();
        });
    }

    if(filterSubjectSelect) {
        filterSubjectSelect.addEventListener('change', (e) => {
            filterSubject = e.target.value;
            displayNotes();
        });
    }

    // Auto-Save listeners routing
    [noteInput, titleInput, tagsInput, subjectInput].forEach(inp => {
        if(inp) {
            inp.addEventListener('input', () => {
                scheduleAutoSave();
            });
        }
    });

    // Wire global tag button workflows
    const newTagInput = document.getElementById('newTagInput');
    const addTagBtn = document.getElementById('addTagBtn');
    if(addTagBtn && newTagInput) {
        addTagBtn.addEventListener('click', () => {
            const v = newTagInput.value.trim();
            if(!v) return;
            addGlobalTags([v]);
            newTagInput.value = '';
            renderSuggestedTags();
        });
        newTagInput.addEventListener('keydown', (e) => { 
            if(e.key === 'Enter') { e.preventDefault(); addTagBtn.click(); } 
        });
    }

    // Wire Up Sub-Section Core Adding Block
    const addSectionBtn = document.getElementById('addSectionBtn');
    if(addSectionBtn) {
        addSectionBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const typeSelect = document.getElementById('newSectionType');
            const mainEditor = document.getElementById('noteInput');
            if(!mainEditor || !mainEditor.value.trim()) {
                showCustomDialog("Section Error", "Please write text inside the main workspace editor area to convert into a specialized sub-section module.");
                return;
            }
            activeNoteSections.push({
                type: typeSelect.value,
                content: mainEditor.value.trim()
            });
            mainEditor.value = ''; // Flush workspace for next entry
            renderActiveSectionsPreview();
        });
    }

    // Wire Up Folders Creation Actions
    const addFolderBtn = document.getElementById('addFolderBtn');
    if(addFolderBtn) {
        addFolderBtn.addEventListener('click', () => {
            const input = document.getElementById('newFolderName');
            const name = input ? input.value.trim() : '';
            if(!name) return;
            folders.push({ id: 'f_' + Date.now(), name: name });
            localStorage.setItem('folders', JSON.stringify(folders));
            if(input) input.value = '';
            refreshFilters();
        });
    }

    // Wire Up Subjects Color Panel Setup
    const addSubjectBtn = document.getElementById('addSubjectBtn');
    if(addSubjectBtn) {
        addSubjectBtn.addEventListener('click', () => {
            const nameInput = document.getElementById('newSubjectName');
            const colorInput = document.getElementById('newSubjectColor');
            const name = nameInput ? nameInput.value.trim() : '';
            const color = colorInput ? colorInput.value : '#ffd966';
            if(!name) return;
            subjects[name] = color;
            localStorage.setItem('subjects', JSON.stringify(subjects));
            if(nameInput) nameInput.value = '';
            refreshFilters();
        });
    }

    // Wire Up Attendance Management Workflows
    const markPresentBtn = document.getElementById('markPresentBtn');
    const markAbsentBtn = document.getElementById('markAbsentBtn');
    if(markPresentBtn) markPresentBtn.addEventListener('click', () => recordAttendance(true));
    if(markAbsentBtn) markAbsentBtn.addEventListener('click', () => recordAttendance(false));

    // Wire Up Assignments Tracker Infrastructure
    const addAssignmentBtn = document.getElementById('addAssignmentBtn');
    if(addAssignmentBtn) {
        addAssignmentBtn.addEventListener('click', () => {
            const titleIn = document.getElementById('assignmentTitle');
            const subjIn = document.getElementById('assignmentSubject');
            const dueIn = document.getElementById('assignmentDue');
            if(!titleIn || !titleIn.value.trim()) {
                showCustomDialog("Data Error", "Please supply an assignment title description.");
                return;
            }
            assignments.push({
                id: 'a_' + Date.now(),
                title: titleIn.value.trim(),
                subject: subjIn ? subjIn.value : '',
                dueDate: dueIn ? dueIn.value : '',
                completed: false
            });
            localStorage.setItem('assignments', JSON.stringify(assignments));
            titleIn.value = '';
            if(dueIn) dueIn.value = '';
            renderAssignmentsList();
        });
    }

    // Live Markdown Engine Toggle Event Listener
    const livePreviewToggle = document.getElementById('livePreviewToggle');
    if(livePreviewToggle) {
        livePreviewToggle.addEventListener('change', () => {
            const previewBox = document.getElementById('livePreview');
            if(!previewBox) return;
            if(livePreviewToggle.checked) {
                previewBox.style.display = 'block';
                previewBox.removeAttribute('aria-hidden');
                updateLiveMarkdownPreview();
            } else {
                previewBox.style.display = 'none';
                previewBox.setAttribute('aria-hidden', 'true');
            }
        });
    }
    if(noteInput) {
        noteInput.addEventListener('input', () => {
            if(livePreviewToggle && livePreviewToggle.checked) updateLiveMarkdownPreview();
        });
    }

    // Intercept Serverless Inbound Share Links (Issue #62 Pipeline)
    checkIncomingShareLinks();

    // Master UI Generation Loop
    refreshFilters();
    restoreDraft();
    displayNotes();
    renderRecentItemsPanel();
});

// Helper: Custom Non-Blocking Promise-Based Modal Engine (Issue #58)
function showCustomDialog(title, message, showCancel = false) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customModalOverlay');
        const titleEl = document.getElementById('customModalTitle');
        const msgEl = document.getElementById('customModalMessage');
        const confirmBtn = document.getElementById('customModalConfirmBtn');
        const cancelBtn = document.getElementById('customModalCancelBtn');

        if(!overlay) {
            // Fallback framework if DOM isn't ready
            if(showCancel) resolve(confirm(message));
            else { alert(message); resolve(true); }
            return;
        }

        titleEl.textContent = title;
        msgEl.textContent = message;
        cancelBtn.style.display = showCancel ? 'inline-block' : 'none';
        overlay.style.display = 'flex';
        overlay.removeAttribute('aria-hidden');

        function cleanup(value) {
            overlay.style.display = 'none';
            overlay.setAttribute('aria-hidden', 'true');
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            resolve(value);
        }
        function onConfirm() { cleanup(true); }
        function onCancel() { cleanup(false); }

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
    });
}

// Data Normalization Schema Guard
function loadNotesFromStorage() {
    let rawNotes = JSON.parse(localStorage.getItem("notes")) || [];
    notes = rawNotes.map(n => {
        if(typeof n === 'string' || !n.id) {
            const textContent = typeof n === 'string' ? n : (n.text || n.content || '');
            const lines = textContent.split('\n').map(l => l.trim()).filter(Boolean);
            return {
                id: Date.now() + Math.floor(Math.random() * 10000),
                title: lines[0] || 'Untitled Note',
                content: textContent,
                sections: [],
                tags: [],
                subject: '',
                folderId: '',
                pinned: false,
                favorite: false,
                date: "Created: " + new Date().toLocaleString()
            };
        }
        return {
            id: n.id,
            title: n.title || '',
            content: n.content || '',
            sections: Array.isArray(n.sections) ? n.sections : [],
            tags: Array.isArray(n.tags) ? n.tags : [],
            subject: n.subject || '',
            folderId: n.folderId || '',
            pinned: !!n.pinned,
            favorite: !!n.favorite,
            date: n.date || ("Created: " + new Date().toLocaleString())
        };
    });
    localStorage.setItem('notes', JSON.stringify(notes));
    loadGlobalTags();
    notes.forEach(n => addGlobalTags(n.tags || []));
}

// Core CRUD Logic
function addNote() {
    const title = document.getElementById("noteTitle").value.trim();
    const content = document.getElementById("noteInput").value.trim();
    const tagsText = document.getElementById('noteTags').value.trim();
    const subjectText = document.getElementById('noteSubject').value.trim();
    const folderId = document.getElementById('noteFolder')?.value || '';

    if(!content && activeNoteSections.length === 0) {
        showCustomDialog("Input Error", "Please enter some content or build structured blocks for your note.");
        return;
    }

    // Deduplication check
    if(notes.some(n => n.content.toLowerCase() === content.toLowerCase() && n.title.toLowerCase() === title.toLowerCase() && n.title !== '')) {
        showCustomDialog("Duplicate Warning", "An identical note already exists!");
        return;
    }

    const newNote = {
        id: Date.now(),
        title: title,
        content: content,
        tags: tagsText ? tagsText.split(',').map(t => t.trim()).filter(Boolean) : [],
        subject: subjectText || '',
        folderId: folderId,
        sections: gatherSectionsFromEditor(),
        pinned: false,
        favorite: false,
        date: "Created: " + new Date().toLocaleString()
    };

    notes.unshift(newNote);
    localStorage.setItem("notes", JSON.stringify(notes));

    // Clear UI Fields
    document.getElementById('noteTitle').value = '';
    document.getElementById('noteInput').value = '';
    document.getElementById('noteTags').value = '';
    document.getElementById('noteSubject').value = '';
    if(document.getElementById('noteFolder')) document.getElementById('noteFolder').value = '';
    if(document.getElementById('sectionsList')) document.getElementById('sectionsList').innerHTML = '';
    
    // Reset our global active section assembler cache
    activeNoteSections = [];

    clearDraft();
    addGlobalTags(newNote.tags);
    
    if(newNote.subject && !subjects[newNote.subject]) {
        subjects[newNote.subject] = '#ffd966';
        localStorage.setItem('subjects', JSON.stringify(subjects));
    }

    const livePreviewBox = document.getElementById('livePreview');
    if(livePreviewBox) livePreviewBox.innerHTML = '';

    refreshFilters();
    displayNotes();
    renderRecentItemsPanel();
}

function displayNotes() {
    const container = document.getElementById("notesContainer");
    const pinnedContainer = document.getElementById('pinnedContainer');
    const pinnedSection = document.getElementById('pinnedSection');
    const favoritesContainer = document.getElementById('favoritesContainer');
    const favoritesSection = document.getElementById('favoritesSection');

    if(!container) return;

    container.innerHTML = "";
    if(pinnedContainer) pinnedContainer.innerHTML = "";
    if(favoritesContainer) favoritesContainer.innerHTML = "";

    const filtered = notes.filter(note => {
        const combined = (note.title + ' ' + note.content).toLowerCase();
        if(searchQuery && !combined.includes(searchQuery.toLowerCase())) return false;
        
        if(filterTags.length) {
            const noteTags = note.tags.map(t => t.toLowerCase());
            if(!filterTags.every(t => noteTags.includes(t.toLowerCase()))) return false;
        }

        if(filterSubject && note.subject.toLowerCase() !== filterSubject.toLowerCase()) return false;
        
        if(currentFolder && String(note.folderId) !== String(currentFolder)) return false;
        
        return true;
    });

    if(filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="text-align:center; padding:20px; color:gray;">
                <p>No matching notes found. Clear filters or create a new note!</p>
            </div>`;
        if(pinnedSection) pinnedSection.style.display = 'none';
        if(favoritesSection) favoritesSection.style.display = 'none';
        return;
    }

    filtered.forEach(note => {
        let rawHtml = window.marked ? marked.parse(note.content || '') : escapeHtml(note.content || '');
        let safeHtml = window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml;

        const tmp = document.createElement('div');
        tmp.innerHTML = safeHtml;
        if(searchQuery) highlightInElement(tmp, searchQuery);

        const titleMarkup = note.title ? `<h4 class="note-card-title" style="margin-top:0; font-size:1.15em;">${escapeHtml(note.title)}</h4>` : '';
        const subjectColor = subjects[note.subject] || '#ffd966';
        const subjectMarkup = note.subject ? `<span class="subject-chip" style="background:${sanitizeColor(subjectColor)}; padding:2px 6px; border-radius:4px; font-size:0.8em; color:#000;">${escapeHtml(note.subject)}</span>` : '';
        const tagsMarkup = note.tags.map(t => `<span class="tag-chip" style="cursor:pointer; color:blue; font-size:0.85em; margin-right:5px;" onclick="applyTagFilter('${escapeHtml(t)}')">#${escapeHtml(t)}</span>`).join(' ');

        // Render localized subsection components
        const sectionsMarkup = (note.sections || []).map(s => {
            let secHtml = window.marked ? marked.parse(s.content || '') : escapeHtml(s.content || '');
            let secSafe = window.DOMPurify ? DOMPurify.sanitize(secHtml) : secHtml;
            return `<div class="note-section-block ${escapeHtml(s.type)}" style="border-left:3px solid var(--muted-text-color, gray); padding-left:8px; margin:8px 0; background:rgba(0,0,0,0.03);">
                <small class="section-label" style="text-transform:uppercase; font-size:0.75em; font-weight:bold; color:gray;">${escapeHtml(s.type)}</small>
                <div>${secSafe}</div>
            </div>`;
        }).join('');

        const cardTemplate = `
            <div class="note-card" data-id="${note.id}" style="border:1px solid #ccc; padding:12px; margin-bottom:12px; border-radius:6px; position:relative;">
                <div class="note-card-actions" style="display:flex; justify-content:flex-end; gap:8px; margin-bottom:6px;">
                    <button type="button" onclick="toggleFavorite(${note.id})" title="Favorite">${note.favorite ? '★' : '☆'}</button>
                    <button type="button" onclick="togglePin(${note.id})" title="Pin">${note.pinned ? '📌 Unpin' : '📌 Pin'}</button>
                    <button type="button" onclick="shareNoteLink(${note.id})" title="Generate Share Link">🔗 Share</button>
                    <button type="button" class="delete-card-btn" onclick="deleteNote(${note.id})" style="color:red; background:none; border:none; cursor:pointer; font-weight:bold;">✕</button>
                </div>
                ${titleMarkup}
                <div class="note-card-body">${tmp.innerHTML}</div>
                ${sectionsMarkup}
                <div class="note-card-metadata" style="margin-top:10px; display:flex; flex-direction:column; gap:4px;">
                    <div>${subjectMarkup}</div>
                    <div class="tags-row">${tagsMarkup}</div>
                    <small class="note-timestamp" style="color:gray; font-size:0.75em;">${note.date}</small>
                </div>
            </div>
        `;

        if(note.favorite && favoritesContainer) {
            favoritesContainer.innerHTML += cardTemplate;
        } else if(note.pinned && pinnedContainer) {
            pinnedContainer.innerHTML += cardTemplate;
        } else {
            container.innerHTML += cardTemplate;
        }
    });

    // Layout visibilities toggling updates
    if(pinnedSection) pinnedSection.style.display = pinnedContainer?.children.length ? 'block' : 'none';
    if(favoritesSection) favoritesSection.style.display = favoritesContainer?.children.length ? 'block' : 'none';

    renderSuggestedTags();
}

function deleteNote(id) {
    const idx = notes.findIndex(n => n.id === id);
    if(idx === -1) return;
    
    showCustomDialog("Confirm Destruction", "Are you sure you want to permanently erase this note?", true).then(confirmed => {
        if(confirmed) {
            notes.splice(idx, 1);
            localStorage.setItem("notes", JSON.stringify(notes));
            displayNotes();
            refreshFilters();
            renderRecentItemsPanel();
        }
    });
}

function togglePin(id) {
    const idx = notes.findIndex(n => n.id === id);
    if(idx !== -1) {
        notes[idx].pinned = !notes[idx].pinned;
        localStorage.setItem('notes', JSON.stringify(notes));
        displayNotes();
    }
}

function toggleFavorite(id) {
    const idx = notes.findIndex(n => n.id === id);
    if(idx !== -1) {
        notes[idx].favorite = !notes[idx].favorite;
        localStorage.setItem('notes', JSON.stringify(notes));
        displayNotes();
    }
}

// Global Backup Operations Engine
function exportNotes() {
    if (notes.length === 0) {
        showCustomDialog("Export Void", "You do not have any saved notes to export!");
        return;
    }
    const jsonString = JSON.stringify(notes, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const downloadAnchor = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    
    downloadAnchor.href = URL.createObjectURL(blob);
    downloadAnchor.download = `student_notes_backup_${timestamp}.json`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    URL.revokeObjectURL(downloadAnchor.href);
}

function importNotes(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!Array.isArray(importedData)) {
                showCustomDialog("Import Error", "Import failed: JSON structure must be a valid array list.");
                return;
            }

            const uniqueImportedData = importedData.filter(importedNote => {
                if (typeof importedNote === 'object' && importedNote !== null) {
                    const checkContent = importedNote.content || importedNote.text || '';
                    return !notes.some(existing => existing.content === checkContent);
                }
                return !notes.some(existing => existing.content === importedNote);
            }).map(n => {
                return {
                    id: n.id || Date.now() + Math.floor(Math.random() * 1000),
                    title: n.title || n.text?.split('\n')[0] || 'Imported Note',
                    content: n.content || n.text || '',
                    sections: Array.isArray(n.sections) ? n.sections : [],
                    tags: Array.isArray(n.tags) ? n.tags : [],
                    subject: n.subject || '',
                    folderId: n.folderId || '',
                    pinned: !!n.pinned,
                    favorite: !!n.favorite,
                    date: n.date || "Imported: " + new Date().toLocaleString()
                };
            });

            if (uniqueImportedData.length === 0) {
                showCustomDialog("Import Complete", "All notes in this backup file are already present.");
                event.target.value = '';
                return;
            }

            showCustomDialog("Confirm Import", `Found ${uniqueImportedData.length} unique notes. Add them to workspace?`, true).then(confirmed => {
                if(confirmed) {
                    notes = [...notes, ...uniqueImportedData];
                    localStorage.setItem("notes", JSON.stringify(notes));
                    displayNotes();
                    refreshFilters();
                    renderRecentItemsPanel();
                    showCustomDialog("Success", "Notes successfully integrated!");
                }
            });
        } catch (error) {
            showCustomDialog("Parse Error", "Error parsing backup file. Ensure it is a valid, uncorrupted file.");
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

// Serverless Query Links Sharing Engine (Issue #62 implementation)
function shareNoteLink(id) {
    const note = notes.find(n => n.id === id);
    if(!note) return;

    const sharePayload = {
        title: note.title,
        content: note.content,
        sections: note.sections,
        tags: note.tags,
        subject: note.subject
    };

    try {
        const jsonString = JSON.stringify(sharePayload);
        const base64Encoded = btoa(encodeURIComponent(jsonString).replace(/%([0-9A-F]{2})/g, (match, p1) => {
            return String.fromCharCode('0x' + p1);
        }));

        const shareUrl = `${window.location.origin}${window.location.pathname}?share=${base64Encoded}`;

        if (navigator.share) {
            navigator.share({
                title: note.title || 'Student Note Share',
                text: `Check out this note: ${note.title}`,
                url: shareUrl
            }).catch(() => copyLinkFallback(shareUrl));
        } else {
            copyLinkFallback(shareUrl);
        }
    } catch(e) {
        showCustomDialog("Sharing Failure", "Could not generate transaction hash token.");
    }
}

function copyLinkFallback(url) {
    navigator.clipboard.writeText(url).then(() => {
        showCustomDialog("Link Copied", "Share URL link copied directly to clipboard!");
    }).catch(() => {
        showCustomDialog("Clipboard Error", "Failed to auto copy. Link format: " + url);
    });
}

function checkIncomingShareLinks() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareToken = urlParams.get('share');
    if(!shareToken) return;

    try {
        const decodedJSON = decodeURIComponent(atob(shareToken).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const sharedNoteData = JSON.parse(decodedJSON);
        if(!sharedNoteData.content && (!sharedNoteData.sections || sharedNoteData.sections.length === 0)) return;

        showCustomDialog("Incoming Shared Note", `You received a shared note titled "${sharedNoteData.title || 'Untitled'}". Import this into your dashboard workspace?`, true).then(confirmed => {
            if(confirmed) {
                const importedSharedNote = {
                    id: Date.now(),
                    title: sharedNoteData.title || 'Shared Note',
                    content: sharedNoteData.content || '',
                    sections: Array.isArray(sharedNoteData.sections) ? sharedNoteData.sections : [],
                    tags: Array.isArray(sharedNoteData.tags) ? sharedNoteData.tags : [],
                    subject: sharedNoteData.subject || '',
                    folderId: '',
                    pinned: false,
                    favorite: false,
                    date: "Shared: " + new Date().toLocaleString()
                };

                notes.unshift(importedSharedNote);
                localStorage.setItem("notes", JSON.stringify(notes));
                displayNotes();
                refreshFilters();
                renderRecentItemsPanel();
            }
            window.history.replaceState({}, document.title, window.location.pathname);
        });
    } catch(e) {
        console.error("Invalid base64 payload share check parsing fault.", e);
    }
}

// Dynamic Sorting Interface Routine
function sortNotes() {
    const sortOrder = document.getElementById("sortOrder").value;
    if (sortOrder === "asc") {
        notes.sort((a, b) => (a.title || a.content).localeCompare(b.title || b.content));
    } else if (sortOrder === "desc") {
        notes.sort((a, b) => (b.title || b.content).localeCompare(a.title || a.content));
    }
    localStorage.setItem("notes", JSON.stringify(notes));
    displayNotes();
}

// Auto-Save Management Workspace Engine
function scheduleAutoSave() {
    const statusEl = document.getElementById('saveStatus');
    if(statusEl) statusEl.textContent = 'Typing...';
    if(autoSaveTimer) clearTimeout(autoSaveTimer);
    
    autoSaveTimer = setTimeout(() => {
        saveDraft();
        if(statusEl) {
            statusEl.textContent = 'Draft Auto-Saved';
            setTimeout(() => { if(statusEl) statusEl.textContent = ''; }, 2000);
        }
        autoSaveTimer = null;
    }, AUTO_SAVE_DELAY);
}

function saveDraft() {
    const title = document.getElementById('noteTitle')?.value || '';
    const content = document.getElementById('noteInput')?.value || '';
    const tags = document.getElementById('noteTags')?.value || '';
    const subject = document.getElementById('noteSubject')?.value || '';

    const draft = { title, content, tags, subject, savedAt: Date.now() };
    try { localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(draft)); } catch(e) {}
}

function restoreDraft() {
    try {
        const raw = localStorage.getItem(AUTO_SAVE_KEY);
        if(!raw) return false;
        const draft = JSON.parse(raw);
        
        const currentContent = document.getElementById('noteInput')?.value || '';
        const currentTitle = document.getElementById('noteTitle')?.value || '';
        if(currentContent || currentTitle) return false;

        if(draft.title) document.getElementById('noteTitle').value = draft.title;
        if(draft.content) document.getElementById('noteInput').value = draft.content;
        if(draft.tags) document.getElementById('noteTags').value = draft.tags;
        if(draft.subject) document.getElementById('noteSubject').value = draft.subject;

        return true;
    } catch(e) { return false; }
}

function clearDraft() {
    try { localStorage.removeItem(AUTO_SAVE_KEY); } catch(e) {}
}

// Global Tag Arrays Utilities Management
function loadGlobalTags() {
    try { globalTags = JSON.parse(localStorage.getItem(TAGS_KEY)) || []; } catch(e) { globalTags = []; }
}

function saveGlobalTags() {
    try { localStorage.setItem(TAGS_KEY, JSON.stringify(globalTags)); } catch(e) {}
}

function addGlobalTags(tagsList) {
    if(!Array.isArray(tagsList)) return;
    tagsList.forEach(t => {
        const val = String(t).trim();
        if(!val) return;
        if(!globalTags.some(gt => gt.toLowerCase() === val.toLowerCase())) {
            globalTags.push(val);
        }
    });
    saveGlobalTags();
}

function renderSuggestedTags() {
    const container = document.getElementById('suggestedTags');
    if(!container) return;
    const counts = {};
    notes.forEach(n => (n.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    const list = Array.from(new Set([].concat(globalTags, Object.keys(counts))));
    list.sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || a.localeCompare(b));
    container.innerHTML = list.map(t => `<button type="button" class="suggested-tag" style="margin:2px; padding:3px 6px; font-size:0.85em;" onclick="applyTagFilter('${escapeHtml(t)}')">${escapeHtml(t)}${counts[t] ? ' ('+counts[t]+')' : ''}</button>`).join(' ');
}

function applyTagFilter(tag) {
    if(!tag) return;
    filterTags = [String(tag)];
    const filterTagsInput = document.getElementById('filterTags');
    if(filterTagsInput) filterTagsInput.value = tag;
    displayNotes();
}

// Local UI Component Data Gathering Handlers
function gatherSectionsFromEditor() {
    return [...activeNoteSections];
}

function getDescendantFolderIds(id) {
    return [];
}

function refreshFilters() {
    const select = document.getElementById('filterSubject');
    if(!select) return;
    
    // Merge subjects from saved options map with any raw subject fields typed on existing notes
    const items = Array.from(new Set([
        ...Object.keys(subjects),
        ...notes.map(n => (n.subject || '').trim()).filter(Boolean)
    ]));
    
    const current = select.value;
    select.innerHTML = '<option value="">All subjects</option>' + items.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    select.value = current || '';
    
    // Execute full sync to sidebar templates
    populateFolderSelect();
    renderFolders();
    renderSubjects();
    populateAttendanceAndAssignmentDropdowns();
    renderAttendancePanel();
    renderAssignmentsList();
}

// Helper Text Node DOM Parsing String Search Highlighter
function highlightInElement(element, query) {
    if(!query) return;
    const q = String(query).trim();
    if(!q) return;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig');
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while(walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(textNode => {
        const parent = textNode.parentNode;
        if(!parent || ['SCRIPT', 'STYLE', 'PRE', 'CODE', 'BUTTON', 'A', 'MARK'].includes(parent.tagName)) return;
        const text = textNode.nodeValue;
        if(!re.test(text)) return;
        
        const frag = document.createDocumentFragment();
        let lastIndex = 0;
        text.replace(re, (match, offset) => {
            const before = text.slice(lastIndex, offset);
            if(before) frag.appendChild(document.createTextNode(before));
            const mark = document.createElement('mark');
            mark.className = 'highlight';
            mark.textContent = match;
            frag.appendChild(mark);
            lastIndex = offset + match.length;
            return match;
        });
        const after = text.slice(lastIndex);
        if(after) frag.appendChild(document.createTextNode(after));
        parent.replaceChild(frag, textNode);
    });
}

// Minimal Theme Layout Initializer
function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeBtn = document.getElementById('themeToggle');
    if(themeBtn) {
        themeBtn.onclick = () => {
            const current = document.documentElement.getAttribute('data-theme');
            const target = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', target);
            localStorage.setItem(THEME_KEY, target);
        };
    }
}

// Micro Utilities Protection Sanitisers
function escapeHtml(str) {
    if(!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Live Markdown Editor Processing Preview Logic
function updateLiveMarkdownPreview() {
    const editor = document.getElementById('noteInput');
    const previewBox = document.getElementById('livePreview');
    if(!editor || !previewBox) return;
    let raw = window.marked ? marked.parse(editor.value) : escapeHtml(editor.value);
    previewBox.innerHTML = window.DOMPurify ? DOMPurify.sanitize(raw) : raw;
}

function sanitizeColor(hex) {
    return /^#[0-9A-F]{6}$/i.test(hex) ? hex : '#ffd966';
}

// --- Implementation of Contributor Feature Systems ---

function renderActiveSectionsPreview() {
    const listContainer = document.getElementById('sectionsList');
    if(!listContainer) return;
    listContainer.innerHTML = activeNoteSections.map((s, idx) => {
        return `<div style="display:flex; justify-content:space-between; align-items:center; background:#eee; margin:4px 0; padding:4px 8px; border-radius:4px; font-size:0.9em;">
            <span><strong>${escapeHtml(s.type.toUpperCase())}</strong>: ${escapeHtml(s.content.substring(0,25))}${s.content.length > 25 ? '...' : ''}</span>
            <button type="button" onclick="removeActiveSection(${idx})" style="color:red; background:none; border:none; cursor:pointer;">✕</button>
        </div>`;
    }).join('');
}

function removeActiveSection(index) {
    activeNoteSections.splice(index, 1);
    renderActiveSectionsPreview();
}

function populateFolderSelect() {
    const select = document.getElementById('noteFolder');
    if(!select) return;
    select.innerHTML = '<option value="">No folder</option>' + folders.map(f => {
        return `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`;
    }).join('');
}

function renderFolders() {
    const el = document.getElementById('foldersTree');
    if(!el) return;
    
    let rootMarkup = `<div style="cursor:pointer; font-weight:${currentFolder === null ? 'bold' : 'normal'}; color:${currentFolder === null ? 'blue' : 'inherit'};" onclick="selectFolder(null)">📁 All Folders / Clear Filter</div>`;
    
    let listMarkup = folders.map(f => {
        return `<div style="display:flex; justify-content:space-between; align-items:center; margin-left:12px; padding:2px 0;">
            <span style="cursor:pointer; font-weight:${currentFolder === f.id ? 'bold' : 'normal'}; color:${currentFolder === f.id ? 'blue' : 'inherit'};" onclick="selectFolder('${f.id}')">📂 ${escapeHtml(f.name)}</span>
            <button type="button" onclick="deleteFolder('${f.id}')" style="background:none; border:none; color:gray; cursor:pointer; font-size:0.85em;">✕</button>
        </div>`;
    }).join('');
    
    el.innerHTML = rootMarkup + listMarkup;
}

function selectFolder(id) {
    currentFolder = id;
    renderFolders();
    displayNotes();
}

function deleteFolder(id) {
    folders = folders.filter(f => f.id !== id);
    localStorage.setItem('folders', JSON.stringify(folders));
    if(currentFolder === id) currentFolder = null;
    
    // Clear out relationship mapping tags across notes inside folder safely
    notes.forEach(n => { if(n.folderId === id) n.folderId = ''; });
    localStorage.setItem('notes', JSON.stringify(notes));
    
    refreshFilters();
    displayNotes();
}

function renderSubjects() {
    const el = document.getElementById('subjectsList');
    if(!el) return;
    
    const subjectKeys = Object.keys(subjects);
    if(subjectKeys.length === 0) {
        el.innerHTML = '<small style="color:gray; display:block;">No subjects added yet.</small>';
        return;
    }
    
    el.innerHTML = subjectKeys.map(s => {
        const color = sanitizeColor(subjects[s]);
        return `<div style="display:inline-flex; align-items:center; justify-content:space-between; width:100%; margin:4px 0; background:${color}; padding:4px 8px; border-radius:4px; font-size:0.85em; color:#000;">
            <span>📚 ${escapeHtml(s)}</span>
            <button type="button" onclick="deleteSubject('${escapeHtml(s)}')" style="background:none; border:none; cursor:pointer; color:#000; font-weight:bold;">✕</button>
        </div>`;
    }).join('');
}

function deleteSubject(name) {
    if(subjects[name]) {
        delete subjects[name];
        localStorage.setItem('subjects', JSON.stringify(subjects));
        if(filterSubject === name) filterSubject = "";
        refreshFilters();
        displayNotes();
    }
}

function populateAttendanceAndAssignmentDropdowns() {
    const attendanceSubj = document.getElementById('attendanceSubject');
    const assignmentSubj = document.getElementById('assignmentSubject');
    const subjectList = Object.keys(subjects);
    
    const optionsMarkup = '<option value="">Select subject</option>' + subjectList.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    
    if(attendanceSubj) {
        const currentSelection = attendanceSubj.value;
        attendanceSubj.innerHTML = optionsMarkup;
        attendanceSubj.value = subjectList.includes(currentSelection) ? currentSelection : '';
    }
    if(assignmentSubj) {
        const currentSelection = assignmentSubj.value;
        assignmentSubj.innerHTML = '<option value="">Subject</option>' + subjectList.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
        assignmentSubj.value = subjectList.includes(currentSelection) ? currentSelection : '';
    }
}

function recordAttendance(isPresent) {
    const subjSelect = document.getElementById('attendanceSubject');
    const dateInput = document.getElementById('attendanceDate');
    
    if(!subjSelect || !subjSelect.value) {
        showCustomDialog("Attendance Error", "Please select a targeted tracking subject module.");
        return;
    }
    
    const subject = subjSelect.value;
    const dateValue = (dateInput && dateInput.value) ? dateInput.value : new Date().toISOString().split('T')[0];
    
    if(!attendance[subject]) {
        attendance[subject] = [];
    }
    
    // Clear preexisting metrics entries for matching calendar slot logs to avoid bloating duplicates
    attendance[subject] = attendance[subject].filter(record => record.date !== dateValue);
    
    attendance[subject].push({ date: dateValue, status: isPresent ? 'Present' : 'Absent' });
    localStorage.setItem('attendance', JSON.stringify(attendance));
    renderAttendancePanel();
}

function renderAttendancePanel() {
    const container = document.getElementById('attendanceSummary');
    if(!container) return;
    
    const loggedSubjects = Object.keys(attendance);
    if(loggedSubjects.length === 0) {
        container.innerHTML = '<small style="color:gray; display:block; margin-top:6px;">No metrics logs loaded yet.</small>';
        return;
    }
    
    let summaryHtml = loggedSubjects.map(subj => {
        const records = attendance[subj] || [];
        const presents = records.filter(r => r.status === 'Present').length;
        const total = records.length;
        const percentage = total > 0 ? Math.round((presents / total) * 100) : 0;
        
        return `<div style="font-size:0.85em; margin:6px 0; padding-bottom:4px; border-bottom:1px dashed #ddd;">
            <div style="display:flex; justify-content:space-between;">
                <strong>${escapeHtml(subj)}</strong>
                <span>${presents}/${total} (${percentage}%)</span>
            </div>
            <div style="font-size:0.75em; color:gray; max-height:30px; overflow-y:auto; margin-top:2px;">
                ${records.map(r => `${r.date.substring(5)}:${r.status === 'Present' ? 'P' : 'A'}`).join(', ')}
            </div>
        </div>`;
    }).join('');
    
    container.innerHTML = summaryHtml;
}

function renderAssignmentsList() {
    const container = document.getElementById('assignmentsList');
    if(!container) return;
    
    if(assignments.length === 0) {
        container.innerHTML = '<small style="color:gray; display:block; margin-top:6px;">All clean! No upcoming deadlines.</small>';
        return;
    }
    
    container.innerHTML = assignments.map(a => {
        return `<div class="assignment-item" style="font-size:0.85em; margin:6px 0; background:rgba(0,0,0,0.02); padding:6px; border-radius:4px; border-left:3px solid ${a.completed ? 'green' : 'orange'}">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <label style="display:inline-flex; gap:6px; align-items:center; cursor:pointer; text-decoration:${a.completed ? 'line-through' : 'none'}; color:${a.completed ? 'gray' : 'inherit'}">
                    <input type="checkbox" ${a.completed ? 'checked' : ''} onchange="toggleAssignmentCompletion('${a.id}')" />
                    <span>${escapeHtml(a.title)}</span>
                </label>
                <button type="button" onclick="deleteAssignment('${a.id}')" style="background:none; border:none; color:gray; cursor:pointer;">✕</button>
            </div>
            <div style="font-size:0.75em; color:gray; margin-left:20px; margin-top:2px;">
                ${a.subject ? `Subject: ${escapeHtml(a.subject)} ` : ''}${a.dueDate ? `| Due: ${escapeHtml(a.dueDate)}` : ''}
            </div>
        </div>`;
    }).join('');
}

function toggleAssignmentCompletion(id) {
    const idx = assignments.findIndex(a => a.id === id);
    if(idx !== -1) {
        assignments[idx].completed = !assignments[idx].completed;
        localStorage.setItem('assignments', JSON.stringify(assignments));
        renderAssignmentsList();
    }
}

function deleteAssignment(id) {
    assignments = assignments.filter(a => a.id !== id);
    localStorage.setItem('assignments', JSON.stringify(assignments));
    renderAssignmentsList();
}

function renderRecentItemsPanel() {
    const container = document.getElementById('recentContainer');
    if(!container) return;
    
    if(notes.length === 0) {
        container.innerHTML = '<small style="color:gray;">No recent documents found.</small>';
        return;
    }
    
    // Take the top 5 most recently updated records
    const recentSubset = notes.slice(0, 5);
    
    container.innerHTML = recentSubset.map(n => {
        const titleText = n.title || n.content.substring(0, 20) + (n.content.length > 20 ? '...' : '');
        return `<div style="padding:6px; font-size:0.85em; border-bottom:1px solid rgba(0,0,0,0.05); cursor:pointer; color:var(--muted-text-color, #333);" onclick="focusRecentNoteCard(${n.id})">
            📄 ${escapeHtml(titleText)}
        </div>`;
    }).join('');
}

function focusRecentNoteCard(id) {
    const element = document.querySelector(`[data-id="${id}"]`);
    if(element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.outline = "2px solid blue";
        setTimeout(() => { element.style.outline = "none"; }, 2000);
    } else {
        // Fallback: clear active folder context view lock rules in case searching target card is buried away out of filter scope context
        currentFolder = null;
        filterTags = [];
        filterSubject = "";
        const fTags = document.getElementById('filterTags'); if(fTags) fTags.value = '';
        const fSubj = document.getElementById('filterSubject'); if(fSubj) fSubj.value = '';
        displayNotes();
        
        setTimeout(() => {
            const targetedEl = document.querySelector(`[data-id="${id}"]`);
            if(targetedEl) {
                targetedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetedEl.style.outline = "2px solid blue";
                setTimeout(() => { targetedEl.style.outline = "none"; }, 2000);
            }
        }, 100);
    }
}