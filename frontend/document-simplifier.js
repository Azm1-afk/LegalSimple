(function () {
    'use strict';

    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
    const PROCESSING_STEP_DELAY_MS = 900;
    const MESSAGE_CLEAR_DELAY_MS = 4000;
    const PROCESSING_MESSAGES = [
        'Uploading the PDF securely',
        'Extracting and indexing document text',
        'Retrieving important legal content',
        'Generating the plain-language explanation',
    ];

    class SimplifierApiError extends Error {}

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

    const apiBaseUrl = getApiBaseUrl();
    const elements = {
        form: document.getElementById('simplifier-form'),
        dropzone: document.getElementById('document-dropzone'),
        fileInput: document.getElementById('document-file'),
        chooseButton: document.getElementById('choose-document-button'),
        error: document.getElementById('upload-error'),
        fileCard: document.getElementById('selected-file'),
        fileName: document.getElementById('selected-file-name'),
        fileSize: document.getElementById('selected-file-size'),
        replaceButton: document.getElementById('replace-file-button'),
        removeButton: document.getElementById('remove-file-button'),
        simplifyButton: document.getElementById('simplify-button'),
        processingPanel: document.getElementById('processing-panel'),
        processingStatus: document.getElementById('processing-status'),
        processingSteps: Array.from(document.querySelectorAll('[data-processing-step]')),
        result: document.getElementById('preview-result'),
        resultHeading: document.getElementById('result-heading'),
        resultFileName: document.getElementById('result-file-name'),
        output: document.getElementById('simplification-output'),
        sources: document.getElementById('simplification-sources'),
        resultDisclaimer: document.getElementById('result-disclaimer'),
        copyButton: document.getElementById('copy-summary-button'),
        downloadButton: document.getElementById('download-text-button'),
        anotherButton: document.getElementById('simplify-another-button'),
        actionStatus: document.getElementById('action-status'),
        announcer: document.getElementById('simplifier-announcer'),
    };

    const requiredElements = Object.entries(elements).filter(function (entry) {
        return entry[0] !== 'processingSteps' && !entry[1];
    });
    if (requiredElements.length > 0 || elements.processingSteps.length !== PROCESSING_MESSAGES.length) {
        return;
    }

    const state = {
        selectedFile: null,
        simplification: '',
        isProcessing: false,
        hasResult: false,
        dragDepth: 0,
        processingTimers: [],
        messageTimer: null,
    };

    function validateFile(file) {
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

    function announce(message) {
        elements.announcer.textContent = '';
        window.setTimeout(function () {
            elements.announcer.textContent = message;
        }, 20);
    }

    function clearError() {
        elements.error.textContent = '';
    }

    function showError(message) {
        elements.error.textContent = message;
        elements.error.focus();
    }

    function updateControlAvailability() {
        const controlsLocked = state.isProcessing || state.hasResult;
        elements.fileInput.disabled = controlsLocked;
        elements.chooseButton.disabled = controlsLocked;
        elements.replaceButton.disabled = controlsLocked;
        elements.removeButton.disabled = controlsLocked;
        elements.simplifyButton.disabled = !state.selectedFile || controlsLocked;
        elements.dropzone.classList.toggle('is-disabled', controlsLocked);
        elements.dropzone.setAttribute('aria-disabled', String(controlsLocked));
    }

    function displaySelectedFile(file) {
        state.selectedFile = file;
        elements.fileName.textContent = file.name;
        elements.fileSize.textContent = formatFileSize(file.size);
        elements.fileCard.hidden = false;
        clearError();
        updateControlAvailability();
        announce(`${file.name} selected and ready to upload.`);
    }

    function clearSelectedFile(options) {
        const settings = Object.assign({clearValidation: true, announceChange: false}, options);
        state.selectedFile = null;
        elements.fileInput.value = '';
        elements.fileName.textContent = '';
        elements.fileSize.textContent = '';
        elements.fileCard.hidden = true;
        state.dragDepth = 0;
        elements.dropzone.classList.remove('is-dragover');
        if (settings.clearValidation) {
            clearError();
        }
        updateControlAvailability();
        if (settings.announceChange) {
            announce('Selected document removed.');
        }
    }

    function handleCandidateFile(file) {
        const validationMessage = validateFile(file);
        if (validationMessage) {
            clearSelectedFile({clearValidation: false});
            showError(validationMessage);
            return;
        }
        displaySelectedFile(file);
    }

    function openFilePicker() {
        if (!state.isProcessing && !state.hasResult) {
            elements.fileInput.click();
        }
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
        elements.processingStatus.textContent = activeIndex < PROCESSING_MESSAGES.length
            ? PROCESSING_MESSAGES[activeIndex]
            : 'Simplification complete';
    }

    function clearProcessingTimers() {
        state.processingTimers.forEach(function (timerId) {
            window.clearTimeout(timerId);
        });
        state.processingTimers = [];
    }

    function startProcessing() {
        clearProcessingTimers();
        resetProcessingSteps();
        state.isProcessing = true;
        state.hasResult = false;
        elements.result.hidden = true;
        elements.processingPanel.hidden = false;
        updateControlAvailability();
        updateProcessingStep(0);

        PROCESSING_MESSAGES.slice(1).forEach(function (_message, offset) {
            const stepIndex = offset + 1;
            const timerId = window.setTimeout(function () {
                if (state.isProcessing) {
                    updateProcessingStep(stepIndex);
                }
            }, PROCESSING_STEP_DELAY_MS * stepIndex);
            state.processingTimers.push(timerId);
        });
    }

    function stopProcessing() {
        clearProcessingTimers();
        state.isProcessing = false;
        elements.processingPanel.hidden = true;
        updateControlAvailability();
    }

    async function readApiError(response, fallbackMessage) {
        try {
            const responseBody = await response.json();
            return typeof responseBody.detail === 'string' ? responseBody.detail : fallbackMessage;
        } catch (_error) {
            return fallbackMessage;
        }
    }

    function formatRetrievedSources(sources) {
        if (!Array.isArray(sources) || sources.length === 0) {
            return '';
        }
        const pageNumbers = sources
            .map(function (source) { return source.page_number; })
            .filter(function (pageNumber) { return Number.isInteger(pageNumber); });
        if (pageNumbers.length > 0) {
            return `Retrieved source pages used: ${pageNumbers.join(', ')}`;
        }
        return `Retrieved source: ${sources[0].filename}`;
    }

    function showResult(responseBody) {
        state.simplification = responseBody.simplification.trim();
        state.hasResult = true;
        updateProcessingStep(PROCESSING_MESSAGES.length);
        stopProcessing();
        elements.resultFileName.textContent = responseBody.filename;
        elements.output.textContent = state.simplification;
        elements.sources.textContent = formatRetrievedSources(responseBody.sources);
        elements.result.hidden = false;
        updateControlAvailability();
        announce('The plain-language document simplification is ready.');
        elements.resultHeading.focus();
    }

    async function submitDocument() {
        if (state.isProcessing || state.hasResult) {
            return;
        }

        const validationMessage = validateFile(state.selectedFile);
        if (validationMessage) {
            showError(validationMessage);
            return;
        }

        clearError();
        startProcessing();
        const formData = new FormData();
        formData.append('file', state.selectedFile);

        try {
            const response = await window.fetch(`${apiBaseUrl}/api/document-simplifier`, {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                throw new SimplifierApiError(
                    await readApiError(response, 'The document could not be simplified.')
                );
            }

            const responseBody = await response.json();
            if (
                typeof responseBody.filename !== 'string' ||
                typeof responseBody.simplification !== 'string' ||
                !responseBody.simplification.trim()
            ) {
                throw new SimplifierApiError('The simplifier returned an invalid response.');
            }
            showResult(responseBody);
        } catch (error) {
            stopProcessing();
            const errorMessage = error instanceof SimplifierApiError
                ? error.message
                : 'The document could not be simplified. Check that the backend is running and try again.';
            showError(errorMessage);
            announce(errorMessage);
        }
    }

    function buildResultText() {
        const filename = state.selectedFile ? state.selectedFile.name : 'Uploaded document';
        const sourceText = elements.sources.textContent.trim();
        return [
            'LegalSimple Document Simplifier',
            `Selected filename: ${filename}`,
            '',
            state.simplification,
            sourceText ? `\n${sourceText}` : '',
            '',
            elements.resultDisclaimer.textContent.replace(/\s+/g, ' ').trim(),
        ].join('\n').trim();
    }

    function fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
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

    function showActionMessage(message, type) {
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

    async function copySummary() {
        const summaryText = buildResultText();
        let copied = false;
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(summaryText);
                copied = true;
            } catch (_error) {
                copied = fallbackCopy(summaryText);
            }
        } else {
            copied = fallbackCopy(summaryText);
        }
        showActionMessage(
            copied ? 'Simplification copied.' : 'Could not copy automatically. Please select and copy the result manually.',
            copied ? 'success' : 'error'
        );
    }

    function safeDownloadFilename(originalName) {
        const baseName = originalName.replace(/\.pdf$/i, '').normalize('NFKD');
        const safeBaseName = baseName
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60);
        return `${safeBaseName || 'document'}-legalsimple-simplification.txt`;
    }

    function downloadSummary() {
        if (!state.selectedFile || !state.simplification) {
            showActionMessage('No simplification is available to download.', 'error');
            return;
        }
        try {
            const blob = new Blob([buildResultText()], {type: 'text/plain;charset=utf-8'});
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = safeDownloadFilename(state.selectedFile.name);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 0);
            showActionMessage('Simplification downloaded.', 'success');
        } catch (_error) {
            showActionMessage('Could not create the text download. Please try again.', 'error');
        }
    }

    function resetSimplifier() {
        clearProcessingTimers();
        if (state.messageTimer) {
            window.clearTimeout(state.messageTimer);
            state.messageTimer = null;
        }
        state.isProcessing = false;
        state.hasResult = false;
        state.simplification = '';
        elements.form.reset();
        elements.processingPanel.hidden = true;
        elements.result.hidden = true;
        elements.resultFileName.textContent = '';
        elements.output.textContent = '';
        elements.sources.textContent = '';
        elements.actionStatus.textContent = '';
        elements.actionStatus.classList.remove('is-error');
        resetProcessingSteps();
        clearSelectedFile({clearValidation: true});
        announce('Document Simplifier reset. Choose another PDF to begin.');
        elements.chooseButton.focus();
    }

    elements.chooseButton.addEventListener('click', openFilePicker);
    elements.replaceButton.addEventListener('click', openFilePicker);
    elements.fileInput.addEventListener('change', function () {
        if (elements.fileInput.files && elements.fileInput.files.length > 0) {
            handleCandidateFile(elements.fileInput.files[0]);
        }
    });
    elements.removeButton.addEventListener('click', function () {
        clearSelectedFile({clearValidation: true, announceChange: true});
        elements.chooseButton.focus();
    });
    elements.form.addEventListener('submit', function (event) {
        event.preventDefault();
        submitDocument();
    });

    elements.dropzone.addEventListener('dragenter', function (event) {
        event.preventDefault();
        if (state.isProcessing || state.hasResult) {
            return;
        }
        state.dragDepth += 1;
        elements.dropzone.classList.add('is-dragover');
    });
    elements.dropzone.addEventListener('dragover', function (event) {
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = state.isProcessing || state.hasResult ? 'none' : 'copy';
        }
    });
    elements.dropzone.addEventListener('dragleave', function (event) {
        event.preventDefault();
        state.dragDepth = Math.max(0, state.dragDepth - 1);
        if (state.dragDepth === 0) {
            elements.dropzone.classList.remove('is-dragover');
        }
    });
    elements.dropzone.addEventListener('drop', function (event) {
        event.preventDefault();
        state.dragDepth = 0;
        elements.dropzone.classList.remove('is-dragover');
        if (state.isProcessing || state.hasResult || !event.dataTransfer) {
            return;
        }
        if (event.dataTransfer.files.length !== 1) {
            clearSelectedFile({clearValidation: false});
            showError('Drop one PDF document at a time.');
            return;
        }
        handleCandidateFile(event.dataTransfer.files[0]);
    });
    window.addEventListener('dragover', function (event) { event.preventDefault(); });
    window.addEventListener('drop', function (event) { event.preventDefault(); });
    elements.copyButton.addEventListener('click', copySummary);
    elements.downloadButton.addEventListener('click', downloadSummary);
    elements.anotherButton.addEventListener('click', resetSimplifier);

    resetProcessingSteps();
    updateControlAvailability();
})();
