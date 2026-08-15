(function () {
    'use strict';

    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
    const RISK_LABELS = {
        high: 'High Risk',
        medium: 'Medium Risk',
        low: 'Low Risk',
    };

    class RiskAnalyzerApiError extends Error {}

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
        form: document.getElementById('risk-analyzer-form'),
        fileInput: document.getElementById('document-upload'),
        error: document.getElementById('upload-error'),
        analyzeButton: document.getElementById('analyze-risk-button'),
        processingStatus: document.getElementById('risk-processing-status'),
        result: document.getElementById('risk-result'),
        resultHeading: document.getElementById('risk-result-heading'),
        resultFilename: document.getElementById('risk-result-filename'),
        resultCard: document.getElementById('risk-result-card'),
        resultLevel: document.getElementById('risk-result-level'),
        resultExplanation: document.getElementById('risk-result-explanation'),
        resultSources: document.getElementById('risk-result-sources'),
        anotherButton: document.getElementById('analyze-another-button'),
        announcer: document.getElementById('risk-announcer'),
    };

    if (Object.values(elements).some(function (element) { return !element; })) {
        return;
    }

    const apiBaseUrl = getApiBaseUrl();
    const state = {
        selectedFile: null,
        isProcessing: false,
        hasResult: false,
    };

    function validateFile(file) {
        if (!file) {
            return 'Choose a PDF document before analyzing risk.';
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

    function updateControls() {
        const controlsLocked = state.isProcessing || state.hasResult;
        elements.fileInput.disabled = controlsLocked;
        elements.analyzeButton.disabled = !state.selectedFile || controlsLocked;
    }

    function setProcessing(isProcessing) {
        state.isProcessing = isProcessing;
        elements.form.setAttribute('aria-busy', String(isProcessing));
        elements.processingStatus.hidden = !isProcessing;
        elements.analyzeButton.textContent = isProcessing ? 'Analyzing...' : 'Analyze Risk';
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

    function formatSources(sources) {
        if (!Array.isArray(sources) || sources.length === 0) {
            return '';
        }

        const pageNumbers = sources
            .map(function (source) { return source.page_number; })
            .filter(function (pageNumber) { return Number.isInteger(pageNumber); });
        if (pageNumbers.length > 0) {
            return `Relevant source pages reviewed: ${pageNumbers.join(', ')}`;
        }
        return `Relevant source reviewed: ${sources[0].filename}`;
    }

    function showResult(responseBody) {
        state.hasResult = true;
        elements.resultFilename.textContent = responseBody.filename;
        elements.resultCard.dataset.riskLevel = responseBody.risk_level;
        elements.resultLevel.textContent = RISK_LABELS[responseBody.risk_level];
        elements.resultExplanation.textContent = responseBody.explanation.trim();
        elements.resultSources.textContent = formatSources(responseBody.sources);
        elements.result.hidden = false;
        updateControls();
        announce(`${RISK_LABELS[responseBody.risk_level]} analysis is ready.`);
        elements.resultHeading.focus();
    }

    async function analyzeDocument() {
        if (state.isProcessing || state.hasResult) {
            return;
        }

        const validationMessage = validateFile(state.selectedFile);
        if (validationMessage) {
            showError(validationMessage);
            announce(validationMessage);
            return;
        }

        clearError();
        elements.result.hidden = true;
        setProcessing(true);

        const formData = new FormData();
        formData.append('file', state.selectedFile);

        try {
            const response = await window.fetch(`${apiBaseUrl}/api/risk-analyzer`, {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                throw new RiskAnalyzerApiError(
                    await readApiError(response, 'The document could not be analyzed.')
                );
            }

            const responseBody = await response.json();
            const hasValidRiskLevel = Object.prototype.hasOwnProperty.call(RISK_LABELS, responseBody.risk_level);
            if (
                typeof responseBody.filename !== 'string' ||
                !hasValidRiskLevel ||
                typeof responseBody.explanation !== 'string' ||
                !responseBody.explanation.trim()
            ) {
                throw new RiskAnalyzerApiError('The Risk Analyzer returned an invalid response.');
            }

            setProcessing(false);
            showResult(responseBody);
        } catch (error) {
            setProcessing(false);
            const errorMessage = error instanceof RiskAnalyzerApiError
                ? error.message
                : 'The document could not be analyzed. Check that the backend is running and try again.';
            showError(errorMessage);
            announce(errorMessage);
        }
    }

    function resetAnalyzer() {
        state.selectedFile = null;
        state.isProcessing = false;
        state.hasResult = false;
        elements.form.reset();
        elements.form.setAttribute('aria-busy', 'false');
        elements.processingStatus.hidden = true;
        elements.result.hidden = true;
        elements.resultFilename.textContent = '';
        elements.resultLevel.textContent = '';
        elements.resultExplanation.textContent = '';
        elements.resultSources.textContent = '';
        clearError();
        updateControls();
        announce('Risk Analyzer reset. Choose another PDF to begin.');
        elements.fileInput.focus();
    }

    elements.fileInput.addEventListener('change', function () {
        const selectedFile = elements.fileInput.files && elements.fileInput.files[0];
        const validationMessage = validateFile(selectedFile);
        if (validationMessage) {
            state.selectedFile = null;
            elements.fileInput.value = '';
            showError(validationMessage);
        } else {
            state.selectedFile = selectedFile;
            clearError();
            announce(`${selectedFile.name} selected and ready to analyze.`);
        }
        updateControls();
    });

    elements.form.addEventListener('submit', function (event) {
        event.preventDefault();
        analyzeDocument();
    });

    elements.anotherButton.addEventListener('click', resetAnalyzer);
    updateControls();
})();
