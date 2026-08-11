(function () {
    'use strict';

    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
    const PROCESSING_STEP_DELAY_MS = 450;
    const MESSAGE_CLEAR_DELAY_MS = 4000;
    const DOWNLOAD_FILENAME = 'document-comparison-guide.txt';
    const PROCESSING_MESSAGES = [
        'Loading the comparison format',
        'Organizing review areas',
        'Preparing matching-section checks',
        'Preparing added-and-removed checks',
        'Organizing important-change topics',
        'Displaying the review checklist',
    ];

    const elements = {
        form: document.getElementById('comparison-form'),
        compareButton: document.getElementById('compare-documents-button'),
        swapButton: document.getElementById('swap-documents-button'),
        selectionStatus: document.getElementById('selection-status'),
        processingPanel: document.getElementById('processing-panel'),
        processingStatus: document.getElementById('processing-status'),
        processingSteps: Array.from(document.querySelectorAll('[data-processing-step]')),
        result: document.getElementById('preview-result'),
        resultHeading: document.getElementById('result-heading'),
        resultFirstFile: document.getElementById('result-first-file'),
        resultSecondFile: document.getElementById('result-second-file'),
        previewNotice: document.getElementById('preview-notice'),
        comparisonSummary: document.querySelector('.comparison-summary'),
        resultCards: Array.from(document.querySelectorAll('[data-result-card]')),
        filterButtons: Array.from(document.querySelectorAll('[data-filter]')),
        filterStatus: document.getElementById('filter-status'),
        noFilterResults: document.getElementById('no-filter-results'),
        resultDisclaimer: document.getElementById('result-disclaimer'),
        copyButton: document.getElementById('copy-comparison-button'),
        downloadButton: document.getElementById('download-comparison-button'),
        anotherButton: document.getElementById('compare-another-button'),
        actionStatus: document.getElementById('action-status'),
        announcer: document.getElementById('comparison-announcer'),
    };

    const slots = {
        first: {
            label: 'Document 1',
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
            label: 'Document 2',
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
        elements.form,
        elements.compareButton,
        elements.swapButton,
        elements.selectionStatus,
        elements.processingPanel,
        elements.processingStatus,
        elements.result,
        elements.resultHeading,
        elements.resultFirstFile,
        elements.resultSecondFile,
        elements.previewNotice,
        elements.comparisonSummary,
        elements.filterStatus,
        elements.noFilterResults,
        elements.resultDisclaimer,
        elements.copyButton,
        elements.downloadButton,
        elements.anotherButton,
        elements.actionStatus,
        elements.announcer,
        ...Object.values(slots).flatMap(function (slot) {
            return [
                slot.fileInput,
                slot.dropzone,
                slot.chooseButton,
                slot.replaceButton,
                slot.removeButton,
                slot.error,
                slot.fileCard,
                slot.fileName,
                slot.fileSize,
            ];
        }),
    ];

    if (
        requiredElements.some(function (element) { return !element; }) ||
        elements.processingSteps.length !== PROCESSING_MESSAGES.length ||
        elements.resultCards.length === 0 ||
        elements.filterButtons.length === 0
    ) {
        return;
    }

    const state = {
        files: {
            first: null,
            second: null,
        },
        dragDepth: {
            first: 0,
            second: 0,
        },
        isProcessing: false,
        hasResult: false,
        activeFilter: 'all',
        processingTimers: [],
        messageTimer: null,
    };

    function validateDocument(file) {
        if (!file) {
            return 'Choose a PDF document before continuing.';
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
        if (bytes === 0) {
            return '0 bytes';
        }

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

    function clearError(slotName) {
        slots[slotName].error.textContent = '';
    }

    function showError(slotName, message) {
        slots[slotName].error.textContent = message;
        slots[slotName].error.focus();
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

    function updateCompareButton() {
        const bothFilesSelected = Boolean(state.files.first && state.files.second);
        const controlsLocked = state.isProcessing || state.hasResult;

        elements.compareButton.disabled = !bothFilesSelected || controlsLocked;
        elements.swapButton.hidden = !bothFilesSelected;
        elements.swapButton.disabled = !bothFilesSelected || controlsLocked;

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
            elements.selectionStatus.textContent = 'Preparing the comparison guide.';
        } else if (state.hasResult) {
            elements.selectionStatus.textContent = 'Comparison guide displayed. Choose “Compare Another Pair” to start over.';
        } else if (bothFilesSelected) {
            elements.selectionStatus.textContent = 'Two different PDF files are ready for the comparison guide.';
        } else if (state.files.first) {
            elements.selectionStatus.textContent = 'Document 1 is ready. Select Document 2 to continue.';
        } else if (state.files.second) {
            elements.selectionStatus.textContent = 'Document 2 is ready. Select Document 1 to continue.';
        } else {
            elements.selectionStatus.textContent = 'Select two different PDF files to continue.';
        }
    }

    function clearDocument(slotName, options) {
        const settings = Object.assign({ clearValidation: true, announceChange: false }, options);
        const slot = slots[slotName];

        state.files[slotName] = null;
        state.dragDepth[slotName] = 0;
        slot.fileInput.value = '';
        slot.dropzone.classList.remove('is-dragover');
        renderSlot(slotName);

        if (settings.clearValidation) {
            clearError(slotName);
        }

        updateCompareButton();

        if (settings.announceChange) {
            announce(`${slot.label} removed. The other selected document was left unchanged.`);
        }
    }

    function setDocument(slotName, file) {
        const slot = slots[slotName];
        const otherSlotName = slotName === 'first' ? 'second' : 'first';
        const validationMessage = validateDocument(file);

        if (validationMessage) {
            clearDocument(slotName, { clearValidation: false });
            showError(slotName, validationMessage);
            return;
        }

        if (areSameFiles(file, state.files[otherSlotName])) {
            clearDocument(slotName, { clearValidation: false });
            showError(
                slotName,
                'This appears to be the same file selected for both documents. Choose two different PDF files.'
            );
            return;
        }

        state.files[slotName] = file;
        clearError(slotName);
        clearError(otherSlotName);
        renderSlot(slotName);
        updateCompareButton();
        announce(`${file.name} selected as ${slot.label}. The file remains on your device.`);
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

        const firstFile = state.files.first;
        state.files.first = state.files.second;
        state.files.second = firstFile;

        slots.first.fileInput.value = '';
        slots.second.fileInput.value = '';
        clearError('first');
        clearError('second');
        renderSlot('first');
        renderSlot('second');
        updateCompareButton();
        announce('Documents swapped. Previous Document 2 is now Document 1, and previous Document 1 is now Document 2.');
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
            step.classList.toggle('is-complete', index < activeIndex);

            if (index < activeIndex) {
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

        elements.processingStatus.textContent = PROCESSING_MESSAGES[activeIndex];
    }

    function clearProcessingTimers() {
        state.processingTimers.forEach(function (timerId) {
            window.clearTimeout(timerId);
        });
        state.processingTimers = [];
    }

    function setProcessingState(isProcessing) {
        state.isProcessing = isProcessing;
        elements.processingPanel.hidden = !isProcessing;
        updateCompareButton();
    }

    function showPreviewResult() {
        if (!state.isProcessing || !state.files.first || !state.files.second) {
            return;
        }

        state.isProcessing = false;
        state.hasResult = true;
        elements.processingPanel.hidden = true;
        elements.resultFirstFile.textContent = state.files.first.name;
        elements.resultSecondFile.textContent = state.files.second.name;
        elements.result.hidden = false;
        updateCompareButton();
        announce('Document comparison guide ready. Check each topic against the original documents.');
        elements.resultHeading.focus();
    }

    function validateSelection() {
        if (!state.files.first) {
            showError('first', 'Choose Document 1 before comparing.');
            return false;
        }

        if (!state.files.second) {
            showError('second', 'Choose Document 2 before comparing.');
            return false;
        }

        if (areSameFiles(state.files.first, state.files.second)) {
            clearDocument('second', { clearValidation: false });
            showError('second', 'Choose two different documents before comparing.');
            return false;
        }

        return true;
    }

    function simulateComparison() {
        if (state.isProcessing || state.hasResult || !validateSelection()) {
            return;
        }

        clearError('first');
        clearError('second');
        clearProcessingTimers();
        resetProcessingSteps();
        elements.result.hidden = true;
        setProcessingState(true);
        updateProcessingStep(0);
        announce('Preparing the comparison guide.');

        PROCESSING_MESSAGES.slice(1).forEach(function (_message, offset) {
            const stepIndex = offset + 1;
            const timerId = window.setTimeout(function () {
                if (state.isProcessing) {
                    updateProcessingStep(stepIndex);
                }
            }, PROCESSING_STEP_DELAY_MS * stepIndex);
            state.processingTimers.push(timerId);
        });

        const resultTimer = window.setTimeout(
            showPreviewResult,
            PROCESSING_STEP_DELAY_MS * PROCESSING_MESSAGES.length
        );
        state.processingTimers.push(resultTimer);
    }

    function filterComparisonResults(filter) {
        const validFilters = ['all', 'added', 'removed', 'modified', 'important'];
        const selectedFilter = validFilters.includes(filter) ? filter : 'all';
        let visibleCount = 0;

        state.activeFilter = selectedFilter;
        elements.resultCards.forEach(function (card) {
            const categories = (card.dataset.category || '').split(/\s+/).filter(Boolean);
            const isVisible = selectedFilter === 'all' || categories.includes(selectedFilter);
            card.hidden = !isVisible;
            if (isVisible) {
                visibleCount += 1;
            }
        });

        elements.filterButtons.forEach(function (button) {
            const isActive = button.dataset.filter === selectedFilter;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });

        const activeButton = elements.filterButtons.find(function (button) {
            return button.dataset.filter === selectedFilter;
        });
        const filterLabel = activeButton ? activeButton.textContent.trim() : 'All Changes';
        elements.filterStatus.textContent = `Showing ${visibleCount} review topic${visibleCount === 1 ? '' : 's'} for ${filterLabel}.`;
        elements.noFilterResults.hidden = visibleCount !== 0;
    }

    function normalizedText(element) {
        return element.textContent.replace(/\s+/g, ' ').trim();
    }

    function buildMetricText() {
        return Array.from(elements.comparisonSummary.querySelectorAll('dl > div')).map(function (metric) {
            const term = metric.querySelector('dt');
            const value = metric.querySelector('dd');
            return `- ${normalizedText(term)}: ${normalizedText(value)}`;
        }).join('\n');
    }

    function buildCardText(card) {
        const heading = card.querySelector('h3');
        const content = normalizedText(card);
        const headingText = heading ? normalizedText(heading) : 'Review topic';

        return `${headingText}\n${content}`;
    }

    function buildComparisonText(visibleOnly) {
        const firstFilename = state.files.first ? state.files.first.name : 'No Document 1 selected';
        const secondFilename = state.files.second ? state.files.second.name : 'No Document 2 selected';
        const cards = visibleOnly
            ? elements.resultCards.filter(function (card) { return !card.hidden; })
            : elements.resultCards;

        return [
            'LegalSimple Document Comparison Guide',
            `Document 1: ${firstFilename}`,
            `Document 2: ${secondFilename}`,
            '',
            normalizedText(elements.previewNotice),
            '',
            'Core review areas',
            buildMetricText(),
            '',
            visibleOnly ? `Visible review topics — ${state.activeFilter} filter` : 'All comparison checklist sections',
            cards.map(buildCardText).join('\n\n'),
            '',
            normalizedText(elements.resultDisclaimer),
            '',
            'LegalSimple provides general explanations only and is not a substitute for advice from a qualified legal professional.',
        ].join('\n');
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
        const comparisonText = buildComparisonText(true);
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

        if (copied) {
            showMessage('Comparison copied.', 'success');
        } else {
            showMessage('Could not copy automatically. Please select and copy the comparison manually.', 'error');
        }
    }

    function downloadComparison() {
        if (!state.files.first || !state.files.second) {
            showMessage('Select two PDF files before downloading the guide.', 'error');
            return;
        }

        try {
            const blob = new Blob([buildComparisonText(false)], { type: 'text/plain;charset=utf-8' });
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = DOWNLOAD_FILENAME;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(function () {
                URL.revokeObjectURL(objectUrl);
            }, 0);
            showMessage('Comparison guide downloaded.', 'success');
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
        elements.form.reset();
        elements.processingPanel.hidden = true;
        elements.result.hidden = true;
        elements.resultFirstFile.textContent = '';
        elements.resultSecondFile.textContent = '';
        elements.actionStatus.textContent = '';
        elements.actionStatus.classList.remove('is-error');
        resetProcessingSteps();
        clearDocument('first', { clearValidation: true });
        clearDocument('second', { clearValidation: true });
        filterComparisonResults('all');
        announce('Document Comparison reset. Choose Document 1 and Document 2 to begin.');
        slots.first.chooseButton.focus();
    }

    Object.keys(slots).forEach(function (slotName) {
        const slot = slots[slotName];

        slot.chooseButton.addEventListener('click', function () {
            openFilePicker(slotName);
        });

        slot.replaceButton.addEventListener('click', function () {
            openFilePicker(slotName);
        });

        slot.fileInput.addEventListener('change', function () {
            if (slot.fileInput.files && slot.fileInput.files.length > 0) {
                setDocument(slotName, slot.fileInput.files[0]);
            }
        });

        slot.removeButton.addEventListener('click', function () {
            clearDocument(slotName, { clearValidation: true, announceChange: true });
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
                clearDocument(slotName, { clearValidation: false });
                showError(slotName, `Drop one PDF at a time into the ${slot.label} area.`);
                return;
            }

            setDocument(slotName, event.dataTransfer.files[0]);
        });
    });

    elements.form.addEventListener('submit', function (event) {
        event.preventDefault();
        simulateComparison();
    });

    elements.swapButton.addEventListener('click', swapDocuments);

    elements.filterButtons.forEach(function (button) {
        button.addEventListener('click', function () {
            filterComparisonResults(button.dataset.filter);
        });
    });

    window.addEventListener('dragover', function (event) {
        event.preventDefault();
    });

    window.addEventListener('drop', function (event) {
        event.preventDefault();
        Object.keys(slots).forEach(function (slotName) {
            state.dragDepth[slotName] = 0;
            slots[slotName].dropzone.classList.remove('is-dragover');
        });
    });

    window.addEventListener('dragend', function () {
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
    updateCompareButton();
})();
