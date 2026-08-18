(function () {
    'use strict';

    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
    const PROCESSING_STEP_DELAY_MS = 1100;
    const MESSAGE_CLEAR_DELAY_MS = 4000;
    const DOWNLOAD_FILENAME = 'document-comparison.txt';
    const CHANGE_LABELS = {
        modified: 'Modified',
        added: 'Added',
        removed: 'Removed',
        unchanged: 'Unchanged',
    };
    const PROCESSING_MESSAGES = [
        'Uploading both PDFs',
        'Extracting and indexing document text',
        'Matching original passages to revised passages',
        'Checking revised passages for new clauses',
        'Checking changed amounts, dates, and deadlines',
        'Generating structured explanations',
    ];

    class ComparisonApiError extends Error {}

    // Use the same backend URL behavior as LegalSimple's other AI tools.
    function getApiBaseUrl() {
        if (typeof window.LEGALSIMPLE_API_BASE_URL === 'string') {
            return window.LEGALSIMPLE_API_BASE_URL.replace(/\/$/, '');
        }

        const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocalHost && window.location.port !== '8000') {
            return `${window.location.protocol}//${window.location.hostname}:8000`;
        }
        if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
            return window.location.origin;
        }
        return 'http://127.0.0.1:8000';
    }

    const elements = {
        form: document.getElementById('comparison-form'),
        compareButton: document.getElementById('compare-documents-button'),
        swapButton: document.getElementById('swap-documents-button'),
        selectionStatus: document.getElementById('selection-status'),
        requestError: document.getElementById('comparison-request-error'),
        processingPanel: document.getElementById('processing-panel'),
        processingStatus: document.getElementById('processing-status'),
        processingSteps: Array.from(document.querySelectorAll('[data-processing-step]')),
        result: document.getElementById('preview-result'),
        resultHeading: document.getElementById('result-heading'),
        resultFirstFile: document.getElementById('result-first-file'),
        resultSecondFile: document.getElementById('result-second-file'),
        overallSummary: document.getElementById('overall-summary'),
        summaryModifications: document.getElementById('summary-modifications'),
        summaryAdditions: document.getElementById('summary-additions'),
        summaryRemovals: document.getElementById('summary-removals'),
        summaryUnchanged: document.getElementById('summary-unchanged'),
        comparisonCoverage: document.getElementById('comparison-coverage'),
        resultSections: document.getElementById('result-sections'),
        filterButtons: Array.from(document.querySelectorAll('[data-filter]')),
        filterStatus: document.getElementById('filter-status'),
        noFilterResults: document.getElementById('no-filter-results'),
        comparisonDisclaimer: document.getElementById('comparison-disclaimer'),
        copyButton: document.getElementById('copy-comparison-button'),
        downloadButton: document.getElementById('download-comparison-button'),
        anotherButton: document.getElementById('compare-another-button'),
        actionStatus: document.getElementById('action-status'),
        announcer: document.getElementById('comparison-announcer'),
    };

    const slots = {
        first: {
            label: 'Original Document A',
            fileInput: document.getElementById('first-document-file'),
            dropzone: document.getElementById('first-dropzone'),
            chooseButton: document.getElementById('choose-first-document'),
            replaceButton: document.getElementById('replace-first-document'),
            removeButton: document.getElementById('remove-first-document'),
            error: document.getElementById('first-upload-error'),
            fileCard: document.getElementById('first-selected-file'),
            fileName: document.getElementById('first-file-name'),
            fileSize: document.getElementById('first-file-size'),
        },
        second: {
            label: 'Revised Document B',
            fileInput: document.getElementById('second-document-file'),
            dropzone: document.getElementById('second-dropzone'),
            chooseButton: document.getElementById('choose-second-document'),
            replaceButton: document.getElementById('replace-second-document'),
            removeButton: document.getElementById('remove-second-document'),
            error: document.getElementById('second-upload-error'),
            fileCard: document.getElementById('second-selected-file'),
            fileName: document.getElementById('second-file-name'),
            fileSize: document.getElementById('second-file-size'),
        },
    };

    const requiredElements = [
        ...Object.values(elements).filter(function (value) { return !Array.isArray(value); }),
        ...Object.values(slots).flatMap(function (slot) { return Object.values(slot); }),
    ];
    if (
        requiredElements.some(function (element) { return !element; }) ||
        elements.processingSteps.length !== PROCESSING_MESSAGES.length ||
        elements.filterButtons.length === 0
    ) {
        return;
    }

    const apiBaseUrl = getApiBaseUrl();
    const state = {
        files: {first: null, second: null},
        dragDepth: {first: 0, second: 0},
        isProcessing: false,
        hasResult: false,
        activeFilter: 'all',
        processingTimers: [],
        messageTimer: null,
        response: null,
    };

    // Results are rebuilt from the latest API response for each comparison.
    elements.resultSections.replaceChildren();

    // Check the file in the browser before sending it to the backend.
    function validateDocument(file) {
        if (!file) {
            return 'Choose a PDF document before continuing.';
        }
        if (file.size === 0) {
            return 'The selected PDF is empty.';
        }

        const hasPdfExtension = /\.pdf$/i.test(file.name);
        const hasPdfType = file.type === 'application/pdf';
        const typeIsUnavailable = file.type === '';
        if (!hasPdfExtension || (!hasPdfType && !typeIsUnavailable)) {
            return 'That file is not a supported PDF. Choose a file ending in .pdf.';
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
            return 'That PDF is larger than 10 MB. Choose a smaller document.';
        }
        return '';
    }

    function formatFileSize(bytes) {
        const units = ['bytes', 'KB', 'MB', 'GB'];
        const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / Math.pow(1024, unitIndex);
        const digits = unitIndex === 0 || value >= 10 ? 0 : 1;
        return `${value.toFixed(digits)} ${units[unitIndex]}`;
    }

    function areSameFiles(firstFile, secondFile) {
        return Boolean(
            firstFile &&
            secondFile &&
            firstFile.name === secondFile.name &&
            firstFile.size === secondFile.size &&
            firstFile.lastModified === secondFile.lastModified
        );
    }

    function announce(message) {
        elements.announcer.textContent = '';
        window.setTimeout(function () {
            elements.announcer.textContent = message;
        }, 20);
    }

    function clearSlotError(slotName) {
        slots[slotName].error.textContent = '';
    }

    function showSlotError(slotName, message) {
        slots[slotName].error.textContent = message;
        slots[slotName].error.focus();
    }

    function clearRequestError() {
        elements.requestError.textContent = '';
    }

    function showRequestError(message) {
        elements.requestError.textContent = message;
        elements.requestError.focus();
    }

    function renderSlot(slotName) {
        const slot = slots[slotName];
        const file = state.files[slotName];
        if (!file) {
            slot.fileName.textContent = '';
            slot.fileName.removeAttribute('title');
            slot.fileSize.textContent = '';
            slot.fileCard.hidden = true;
            return;
        }

        slot.fileName.textContent = file.name;
        slot.fileName.title = file.name;
        slot.fileSize.textContent = formatFileSize(file.size);
        slot.fileCard.hidden = false;
    }

    function updateControls() {
        const bothFilesSelected = Boolean(state.files.first && state.files.second);
        const controlsLocked = state.isProcessing || state.hasResult;

        // Lock file controls while a request or completed result is active.
        elements.compareButton.disabled = !bothFilesSelected || controlsLocked;
        elements.compareButton.textContent = state.isProcessing ? 'Comparing...' : 'Compare Documents';
        elements.swapButton.hidden = !bothFilesSelected;
        elements.swapButton.disabled = !bothFilesSelected || controlsLocked;
        elements.form.setAttribute('aria-busy', String(state.isProcessing));

        Object.keys(slots).forEach(function (slotName) {
            const slot = slots[slotName];
            slot.fileInput.disabled = controlsLocked;
            slot.chooseButton.disabled = controlsLocked;
            slot.replaceButton.disabled = controlsLocked;
            slot.removeButton.disabled = controlsLocked;
            slot.dropzone.classList.toggle('is-disabled', controlsLocked);
            slot.dropzone.setAttribute('aria-disabled', String(controlsLocked));
        });

        if (state.isProcessing) {
            elements.selectionStatus.textContent = 'The backend is comparing both PDFs.';
        } else if (state.hasResult) {
            elements.selectionStatus.textContent = 'Comparison displayed. Choose “Compare Another Pair” to start over.';
        } else if (bothFilesSelected) {
            elements.selectionStatus.textContent = 'The original and revised PDFs are ready to compare.';
        } else if (state.files.first) {
            elements.selectionStatus.textContent = 'The original PDF is ready. Select the revised PDF.';
        } else if (state.files.second) {
            elements.selectionStatus.textContent = 'The revised PDF is ready. Select the original PDF.';
        } else {
            elements.selectionStatus.textContent = 'Select two different PDF files to continue.';
        }
    }

    function clearDocument(slotName, options) {
        const settings = Object.assign({clearValidation: true, announceChange: false}, options);
        const slot = slots[slotName];
        state.files[slotName] = null;
        state.dragDepth[slotName] = 0;
        slot.fileInput.value = '';
        slot.dropzone.classList.remove('is-dragover');
        renderSlot(slotName);
        if (settings.clearValidation) {
            clearSlotError(slotName);
        }
        clearRequestError();
        updateControls();
        if (settings.announceChange) {
            announce(`${slot.label} removed.`);
        }
    }

    function setDocument(slotName, file) {
        const otherSlotName = slotName === 'first' ? 'second' : 'first';
        const validationMessage = validateDocument(file);
        if (validationMessage) {
            clearDocument(slotName, {clearValidation: false});
            showSlotError(slotName, validationMessage);
            return;
        }
        if (areSameFiles(file, state.files[otherSlotName])) {
            clearDocument(slotName, {clearValidation: false});
            showSlotError(slotName, 'Choose two different PDF files to compare.');
            return;
        }

        state.files[slotName] = file;
        clearSlotError(slotName);
        clearSlotError(otherSlotName);
        clearRequestError();
        renderSlot(slotName);
        updateControls();
        announce(`${file.name} selected as ${slots[slotName].label}.`);
    }

    function openFilePicker(slotName) {
        if (!state.isProcessing && !state.hasResult) {
            slots[slotName].fileInput.click();
        }
    }

    function swapDocuments() {
        if (!state.files.first || !state.files.second || state.isProcessing || state.hasResult) {
            return;
        }
        const originalFile = state.files.first;
        state.files.first = state.files.second;
        state.files.second = originalFile;
        slots.first.fileInput.value = '';
        slots.second.fileInput.value = '';
        clearSlotError('first');
        clearSlotError('second');
        clearRequestError();
        renderSlot('first');
        renderSlot('second');
        updateControls();
        announce('The original and revised document positions were swapped.');
    }

    function resetProcessingSteps() {
        elements.processingSteps.forEach(function (step, index) {
            step.classList.remove('is-current', 'is-complete');
            step.querySelector('.processing-step__marker').textContent = String(index + 1);
            step.querySelector('.processing-step__state').textContent = 'Waiting';
        });
        elements.processingStatus.textContent = PROCESSING_MESSAGES[0];
    }

    function updateProcessingStep(activeIndex) {
        elements.processingSteps.forEach(function (step, index) {
            const marker = step.querySelector('.processing-step__marker');
            const stepState = step.querySelector('.processing-step__state');
            step.classList.toggle('is-current', index === activeIndex);
            step.classList.toggle('is-complete', index < activeIndex || activeIndex === PROCESSING_MESSAGES.length);
            if (index < activeIndex || activeIndex === PROCESSING_MESSAGES.length) {
                marker.textContent = '\u2713';
                stepState.textContent = 'Complete';
            } else if (index === activeIndex) {
                marker.textContent = String(index + 1);
                stepState.textContent = 'Current';
            } else {
                marker.textContent = String(index + 1);
                stepState.textContent = 'Waiting';
            }
        });
        elements.processingStatus.textContent = activeIndex < PROCESSING_MESSAGES.length
            ? PROCESSING_MESSAGES[activeIndex]
            : 'Comparison complete';
    }

    function clearProcessingTimers() {
        state.processingTimers.forEach(function (timerId) { window.clearTimeout(timerId); });
        state.processingTimers = [];
    }

    function startProcessing() {
        clearProcessingTimers();
        resetProcessingSteps();
        state.isProcessing = true;
        state.hasResult = false;
        elements.result.hidden = true;
        elements.processingPanel.hidden = false;
        updateControls();
        updateProcessingStep(0);

        // These messages provide progress feedback while the single request runs.
        PROCESSING_MESSAGES.slice(1).forEach(function (_message, offset) {
            const stepIndex = offset + 1;
            state.processingTimers.push(window.setTimeout(function () {
                if (state.isProcessing) {
                    updateProcessingStep(stepIndex);
                }
            }, PROCESSING_STEP_DELAY_MS * stepIndex));
        });
    }

    function stopProcessing() {
        clearProcessingTimers();
        state.isProcessing = false;
        elements.processingPanel.hidden = true;
        updateControls();
    }

    async function readApiError(response, fallbackMessage) {
        try {
            const responseBody = await response.json();
            return typeof responseBody.detail === 'string' ? responseBody.detail : fallbackMessage;
        } catch (_error) {
            return fallbackMessage;
        }
    }

    function isValidResponse(responseBody) {
        // Reject incomplete data before trying to display comparison cards.
        const summary = responseBody && responseBody.summary;
        const validCounts = summary && ['modifications', 'additions', 'removals', 'unchanged'].every(function (key) {
            return Number.isInteger(summary[key]) && summary[key] >= 0;
        });
        const validItems = responseBody && Array.isArray(responseBody.items) && responseBody.items.length > 0 && responseBody.items.every(function (item) {
            return item &&
                typeof item.comparison_id === 'string' &&
                typeof item.section_title === 'string' &&
                Object.prototype.hasOwnProperty.call(CHANGE_LABELS, item.change_type) &&
                typeof item.explanation === 'string' &&
                typeof item.potential_significance === 'string' &&
                typeof item.important === 'boolean';
        });
        return Boolean(
            responseBody &&
            typeof responseBody.original_filename === 'string' &&
            typeof responseBody.revised_filename === 'string' &&
            typeof responseBody.overall_summary === 'string' &&
            typeof responseBody.coverage_note === 'string' &&
            typeof responseBody.disclaimer === 'string' &&
            validCounts &&
            validItems
        );
    }

    function formatSource(source) {
        if (!source || typeof source.filename !== 'string') {
            return '';
        }
        const pageText = Number.isInteger(source.page_number) ? `, page ${source.page_number}` : '';
        return `Source: Document ${source.document_label}, ${source.filename}${pageText}`;
    }

    function createWordingPanel(title, text, source, revised) {
        const panel = document.createElement('div');
        panel.className = revised ? 'wording-panel wording-panel--second' : 'wording-panel wording-panel--first';
        const heading = document.createElement('h4');
        heading.textContent = title;
        const sourceLabel = document.createElement('span');
        sourceLabel.textContent = formatSource(source);
        heading.appendChild(sourceLabel);
        const excerpt = document.createElement('p');
        excerpt.textContent = text;
        panel.append(heading, excerpt);
        return panel;
    }

    function createComparisonCard(item) {
        // Build elements with textContent so document text is never treated as HTML.
        const card = document.createElement('article');
        const styleClass = item.change_type === 'unchanged' ? 'matching' : item.change_type;
        card.className = `result-card result-card--${styleClass}`;
        card.dataset.resultCard = '';
        card.dataset.category = `${item.change_type}${item.important ? ' important' : ''}`;

        const heading = document.createElement('div');
        heading.className = 'result-card__heading';
        const badge = document.createElement('span');
        badge.className = `change-badge change-badge--${item.change_type}`;
        badge.textContent = CHANGE_LABELS[item.change_type];
        const title = document.createElement('h3');
        title.textContent = item.section_title;
        heading.append(badge, title);
        if (item.important) {
            const importantBadge = document.createElement('span');
            importantBadge.className = 'change-badge change-badge--attention';
            importantBadge.textContent = 'Important';
            heading.appendChild(importantBadge);
        }
        card.appendChild(heading);

        const wording = document.createElement('div');
        wording.className = 'wording-comparison';
        if (typeof item.original_text === 'string') {
            wording.appendChild(createWordingPanel('Original — Document A', item.original_text, item.original_source, false));
        }
        if (typeof item.revised_text === 'string') {
            wording.appendChild(createWordingPanel('Revised — Document B', item.revised_text, item.revised_source, true));
        }
        card.appendChild(wording);

        const explanation = document.createElement('div');
        explanation.className = 'change-explanation';
        const explanationHeading = document.createElement('h4');
        explanationHeading.textContent = 'What changed';
        const explanationText = document.createElement('p');
        explanationText.textContent = item.explanation;
        explanation.append(explanationHeading, explanationText);
        card.appendChild(explanation);

        const details = document.createElement('dl');
        details.className = 'important-change-details';
        const detail = document.createElement('div');
        const term = document.createElement('dt');
        term.textContent = 'Potential significance';
        const description = document.createElement('dd');
        description.textContent = item.potential_significance;
        detail.append(term, description);
        details.appendChild(detail);
        card.appendChild(details);
        return card;
    }

    function renderComparison(responseBody) {
        elements.resultFirstFile.textContent = responseBody.original_filename;
        elements.resultSecondFile.textContent = responseBody.revised_filename;
        elements.overallSummary.textContent = responseBody.overall_summary;
        elements.summaryModifications.textContent = String(responseBody.summary.modifications);
        elements.summaryAdditions.textContent = String(responseBody.summary.additions);
        elements.summaryRemovals.textContent = String(responseBody.summary.removals);
        elements.summaryUnchanged.textContent = String(responseBody.summary.unchanged);
        elements.comparisonCoverage.textContent = responseBody.coverage_note;
        elements.comparisonDisclaimer.textContent = responseBody.disclaimer;
        elements.resultSections.replaceChildren(...responseBody.items.map(createComparisonCard));
        filterComparisonResults('all');
    }

    function showResult(responseBody) {
        state.response = responseBody;
        state.hasResult = true;
        updateProcessingStep(PROCESSING_MESSAGES.length);
        stopProcessing();
        renderComparison(responseBody);
        elements.result.hidden = false;
        updateControls();
        announce('The document comparison is ready.');
        elements.resultHeading.focus();
    }

    function validateSelection() {
        const firstError = validateDocument(state.files.first);
        if (firstError) {
            showSlotError('first', firstError);
            return false;
        }
        const secondError = validateDocument(state.files.second);
        if (secondError) {
            showSlotError('second', secondError);
            return false;
        }
        if (areSameFiles(state.files.first, state.files.second)) {
            showSlotError('second', 'Choose two different PDF files to compare.');
            return false;
        }
        return true;
    }

    async function compareDocuments() {
        if (state.isProcessing || state.hasResult || !validateSelection()) {
            return;
        }
        clearSlotError('first');
        clearSlotError('second');
        clearRequestError();
        startProcessing();
        announce('Uploading the original and revised PDFs for comparison.');

        // Both documents are sent together so the backend can compare them once.
        const formData = new FormData();
        formData.append('original_file', state.files.first);
        formData.append('revised_file', state.files.second);

        try {
            const response = await window.fetch(`${apiBaseUrl}/api/document-comparison`, {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                throw new ComparisonApiError(
                    await readApiError(response, 'The documents could not be compared.')
                );
            }
            const responseBody = await response.json();
            if (!isValidResponse(responseBody)) {
                throw new ComparisonApiError('Document Comparison returned an invalid response.');
            }
            showResult(responseBody);
        } catch (error) {
            stopProcessing();
            const message = error instanceof ComparisonApiError
                ? error.message
                : 'The documents could not be compared. Check that the backend is running and try again.';
            showRequestError(message);
            announce(message);
        }
    }

    function filterComparisonResults(filter) {
        // Each card may belong to its change type and the Important filter.
        const validFilters = ['all', 'added', 'removed', 'modified', 'unchanged', 'important'];
        const selectedFilter = validFilters.includes(filter) ? filter : 'all';
        const cards = Array.from(elements.resultSections.querySelectorAll('[data-result-card]'));
        let visibleCount = 0;
        state.activeFilter = selectedFilter;
        cards.forEach(function (card) {
            const categories = (card.dataset.category || '').split(/\s+/).filter(Boolean);
            const visible = selectedFilter === 'all' || categories.includes(selectedFilter);
            card.hidden = !visible;
            if (visible) {
                visibleCount += 1;
            }
        });
        elements.filterButtons.forEach(function (button) {
            const active = button.dataset.filter === selectedFilter;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        const labelButton = elements.filterButtons.find(function (button) {
            return button.dataset.filter === selectedFilter;
        });
        const label = labelButton ? labelButton.textContent.trim() : 'All Changes';
        elements.filterStatus.textContent = `Showing ${visibleCount} item${visibleCount === 1 ? '' : 's'} for ${label}.`;
        elements.noFilterResults.hidden = visibleCount !== 0;
    }

    function buildComparisonText() {
        if (!state.response) {
            return '';
        }

        // Copy and download use the same plain-text representation.
        const response = state.response;
        const lines = [
            'LegalSimple Document Comparison',
            `Original Document A: ${response.original_filename}`,
            `Revised Document B: ${response.revised_filename}`,
            '',
            `Summary: ${response.summary.modifications} modified, ${response.summary.additions} added, ${response.summary.removals} removed, ${response.summary.unchanged} unchanged`,
            response.overall_summary,
            response.coverage_note,
            '',
        ];
        response.items.forEach(function (item, index) {
            lines.push(`${index + 1}. ${item.section_title} — ${CHANGE_LABELS[item.change_type]}`);
            if (item.original_text) {
                lines.push(`Original: ${item.original_text}`, formatSource(item.original_source));
            }
            if (item.revised_text) {
                lines.push(`Revised: ${item.revised_text}`, formatSource(item.revised_source));
            }
            lines.push(`Explanation: ${item.explanation}`);
            lines.push(`Potential significance: ${item.potential_significance}`, '');
        });
        lines.push(response.disclaimer);
        return lines.join('\n');
    }

    function fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.setAttribute('readonly', '');
        textArea.className = 'clipboard-buffer';
        document.body.appendChild(textArea);
        textArea.select();
        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch (_error) {
            copied = false;
        }
        textArea.remove();
        return copied;
    }

    function showMessage(message, type) {
        if (state.messageTimer) {
            window.clearTimeout(state.messageTimer);
        }
        elements.actionStatus.textContent = message;
        elements.actionStatus.classList.toggle('is-error', type === 'error');
        state.messageTimer = window.setTimeout(function () {
            elements.actionStatus.textContent = '';
            elements.actionStatus.classList.remove('is-error');
        }, MESSAGE_CLEAR_DELAY_MS);
    }

    async function copyComparison() {
        const comparisonText = buildComparisonText();
        let copied = false;
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(comparisonText);
                copied = true;
            } catch (_error) {
                copied = fallbackCopy(comparisonText);
            }
        } else {
            copied = fallbackCopy(comparisonText);
        }
        showMessage(
            copied ? 'Comparison copied.' : 'Could not copy automatically. Please select and copy it manually.',
            copied ? 'success' : 'error'
        );
    }

    function downloadComparison() {
        if (!state.response) {
            showMessage('Run a comparison before downloading.', 'error');
            return;
        }
        try {
            const blob = new Blob([buildComparisonText()], {type: 'text/plain;charset=utf-8'});
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = DOWNLOAD_FILENAME;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 0);
            showMessage('Comparison downloaded.', 'success');
        } catch (_error) {
            showMessage('Could not create the text download. Please try again.', 'error');
        }
    }

    function resetComparison() {
        clearProcessingTimers();
        if (state.messageTimer) {
            window.clearTimeout(state.messageTimer);
            state.messageTimer = null;
        }
        state.isProcessing = false;
        state.hasResult = false;
        state.response = null;
        elements.form.reset();
        elements.processingPanel.hidden = true;
        elements.result.hidden = true;
        elements.resultSections.replaceChildren();
        elements.actionStatus.textContent = '';
        clearRequestError();
        resetProcessingSteps();
        clearDocument('first', {clearValidation: true});
        clearDocument('second', {clearValidation: true});
        filterComparisonResults('all');
        announce('Document Comparison reset. Choose an original and revised PDF.');
        slots.first.chooseButton.focus();
    }

    Object.keys(slots).forEach(function (slotName) {
        const slot = slots[slotName];
        slot.chooseButton.addEventListener('click', function () { openFilePicker(slotName); });
        slot.replaceButton.addEventListener('click', function () { openFilePicker(slotName); });
        slot.fileInput.addEventListener('change', function () {
            if (slot.fileInput.files && slot.fileInput.files.length > 0) {
                setDocument(slotName, slot.fileInput.files[0]);
            }
        });
        slot.removeButton.addEventListener('click', function () {
            clearDocument(slotName, {clearValidation: true, announceChange: true});
            slot.chooseButton.focus();
        });
        slot.dropzone.addEventListener('dragenter', function (event) {
            event.preventDefault();
            if (state.isProcessing || state.hasResult) {
                return;
            }
            state.dragDepth[slotName] += 1;
            slot.dropzone.classList.add('is-dragover');
        });
        slot.dropzone.addEventListener('dragover', function (event) {
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = state.isProcessing || state.hasResult ? 'none' : 'copy';
            }
        });
        slot.dropzone.addEventListener('dragleave', function (event) {
            event.preventDefault();
            state.dragDepth[slotName] = Math.max(0, state.dragDepth[slotName] - 1);
            if (state.dragDepth[slotName] === 0) {
                slot.dropzone.classList.remove('is-dragover');
            }
        });
        slot.dropzone.addEventListener('drop', function (event) {
            event.preventDefault();
            state.dragDepth[slotName] = 0;
            slot.dropzone.classList.remove('is-dragover');
            if (state.isProcessing || state.hasResult || !event.dataTransfer) {
                return;
            }
            if (event.dataTransfer.files.length !== 1) {
                clearDocument(slotName, {clearValidation: false});
                showSlotError(slotName, `Drop one PDF at a time into the ${slot.label} area.`);
                return;
            }
            setDocument(slotName, event.dataTransfer.files[0]);
        });
    });

    elements.form.addEventListener('submit', function (event) {
        event.preventDefault();
        compareDocuments();
    });
    elements.swapButton.addEventListener('click', swapDocuments);
    elements.filterButtons.forEach(function (button) {
        button.addEventListener('click', function () { filterComparisonResults(button.dataset.filter); });
    });
    window.addEventListener('dragover', function (event) { event.preventDefault(); });
    window.addEventListener('drop', function (event) {
        event.preventDefault();
        Object.keys(slots).forEach(function (slotName) {
            state.dragDepth[slotName] = 0;
            slots[slotName].dropzone.classList.remove('is-dragover');
        });
    });
    elements.copyButton.addEventListener('click', copyComparison);
    elements.downloadButton.addEventListener('click', downloadComparison);
    elements.anotherButton.addEventListener('click', resetComparison);

    resetProcessingSteps();
    filterComparisonResults('all');
    updateControls();
})();
