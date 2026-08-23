/*
 * Notice Generator
 *
 * MEMBER 3 CHANGES:
 * - Added required-field validation.
 * - Added conditional validation based on notice type.
 * - Added an explicit Generate Draft action.
 * - Disabled Copy and Print until a valid draft exists.
 * - Invalidated an old draft when form information changes.
 * - Added Create Another Notice/reset functionality.
 * - Added accessible form and copy status messages.
 */

(function () {
    'use strict';

    /*
     * Locate the main page elements.
     */
    const form = document.getElementById('notice-form');
    const output = document.getElementById('letter-output');
    const copyButton = document.getElementById('copy-button');
    const printButton = document.getElementById('print-button');

    // MEMBER 3 CHANGE: New reset button.
    const resetButton = document.getElementById('reset-button');

    const copyStatus = document.getElementById('copy-status');

    // MEMBER 3 CHANGE: New validation/generation status area.
    const formStatus = document.getElementById('form-status');

    // MEMBER 3 CHANGE: New generated-draft warning.
    const draftWarning = document.getElementById('draft-warning');

    /*
     * Stop safely if this script is accidentally loaded on another page or if
     * the expected HTML is incomplete.
     */
    if (
        !form ||
        !output ||
        !copyButton ||
        !printButton ||
        !resetButton ||
        !copyStatus ||
        !formStatus ||
        !draftWarning
    ) {
        return;
    }

    const typeSelect = form.querySelector('#notice-type');

    /*
     * Convert the NodeList to an Array so it can be processed consistently.
     */
    const typeFields = Array.from(
        form.querySelectorAll('.type-field')
    );

    const fields = {
        senderName: form.querySelector('#sender-name'),
        senderAddress: form.querySelector('#sender-address'),
        recipientName: form.querySelector('#recipient-name'),
        recipientAddress: form.querySelector('#recipient-address'),
        date: form.querySelector('#notice-date'),
        subject: form.querySelector('#notice-subject'),
        amountDue: form.querySelector('#amount-due'),
        dueDate: form.querySelector('#due-date'),
        body: form.querySelector('#notice-body'),
    };

    /*
     * Stop if any expected input is missing.
     */
    if (
        !typeSelect ||
        Object.values(fields).some(function (field) {
            return !field;
        })
    ) {
        return;
    }

    const titles = {
        demand: 'DEMAND LETTER',
        cease: 'CEASE AND DESIST NOTICE',
        vacate: 'NOTICE TO VACATE',
        reminder: 'LEGAL REMINDER NOTICE',
        general: 'LEGAL NOTICE',
    };

    /*
     * MEMBER 3 CHANGE:
     * Tracks whether the preview currently contains a valid, up-to-date draft.
     */
    let hasGeneratedDraft = false;

    /**
     * Convert an HTML date value into a readable date.
     *
     * @param {string} value - Date formatted as YYYY-MM-DD.
     * @returns {string} Formatted date.
     */
    function formatDate(value) {
        const date = new Date(value + 'T00:00:00');

        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    /**
     * MEMBER 3 CHANGE:
     * Display only the fields that apply to the selected notice type.
     *
     * Hidden type-specific fields are disabled and therefore ignored by browser
     * validation. Visible type-specific fields become required.
     */
    function updateVisibleFields() {
        const selectedType = typeSelect.value;

        typeFields.forEach(function (container) {
            const applicableTypes = container.dataset.type.split(' ');
            const isApplicable = applicableTypes.includes(selectedType);
            const input = container.querySelector(
                'input, textarea, select'
            );

            container.hidden = !isApplicable;

            if (!input) {
                return;
            }

            /*
             * Disabled fields are not submitted and are ignored by
             * checkValidity().
             */
            input.disabled = !isApplicable;
            input.required = isApplicable;

            /*
             * Remove irrelevant information when the user changes notice type.
             */
            if (!isApplicable) {
                input.value = '';
            }
        });
    }

    /**
     * Return the closing paragraph for the selected notice type.
     *
     * @param {string} type - Selected notice type.
     * @returns {string} Closing text.
     */
    function closingLine(type) {
        switch (type) {
            case 'demand':
                return (
                    'Please treat this letter as formal notice of the above. ' +
                    'I trust this matter can be resolved without the need for ' +
                    'further action.'
                );

            case 'cease':
                return (
                    'This letter serves as formal notice to stop the above ' +
                    'conduct immediately. Failure to do so may result in ' +
                    'further legal steps being considered.'
                );

            case 'vacate':
                return (
                    'Please treat this as formal notice to vacate the premises ' +
                    'by the date above and to leave them in good condition.'
                );

            case 'reminder':
                return (
                    'This is a reminder of the obligation described above. ' +
                    'Please respond or take the necessary action at your ' +
                    'earliest convenience.'
                );

            default:
                return (
                    'Please treat this letter as formal notice of the above ' +
                    'matter.'
                );
        }
    }

    /**
     * Build the notice using only information supplied by the user.
     *
     * MEMBER 3 CHANGE:
     * Placeholders such as "[Your name]" are no longer inserted into a generated
     * draft because validation prevents incomplete drafts from being generated.
     *
     * @returns {string} Generated notice text.
     */
    function buildLetter() {
        const type = typeSelect.value;
        const lines = [];

        lines.push(fields.senderName.value.trim());

        if (fields.senderAddress.value.trim()) {
            lines.push(fields.senderAddress.value.trim());
        }

        lines.push('');
        lines.push(formatDate(fields.date.value));
        lines.push('');
        lines.push('To:');
        lines.push(fields.recipientName.value.trim());

        if (fields.recipientAddress.value.trim()) {
            lines.push(fields.recipientAddress.value.trim());
        }

        lines.push('');
        lines.push(
            `Subject: ${fields.subject.value.trim() || titles[type]}`
        );
        lines.push('');
        lines.push(
            `Dear ${fields.recipientName.value.trim()},`
        );
        lines.push('');

        if (type === 'demand') {
            lines.push(
                'This letter concerns an outstanding amount of ' +
                `${fields.amountDue.value.trim()}.`
            );
            lines.push('');
        }

        lines.push(fields.body.value.trim());
        lines.push('');

        if (type === 'demand' || type === 'vacate') {
            const requestedAction = type === 'vacate'
                ? 'vacate the premises'
                : 'settle this matter';

            lines.push(
                `Please ${requestedAction} by ` +
                `${formatDate(fields.dueDate.value)}.`
            );
            lines.push('');
        }

        lines.push(closingLine(type));
        lines.push('');
        lines.push('Sincerely,');
        lines.push(fields.senderName.value.trim());

        return lines.join('\n');
    }

    /**
     * MEMBER 3 CHANGE:
     * Show a safe text-only placeholder in the preview.
     *
     * @param {string} message - Placeholder message.
     */
    function showPlaceholder(message) {
        output.textContent = '';

        const placeholder = document.createElement('p');
        placeholder.className = 'letter-placeholder';
        placeholder.textContent = message;

        output.appendChild(placeholder);
    }

    /**
     * MEMBER 3 CHANGE:
     * Enable or disable actions that require a valid generated draft.
     *
     * @param {boolean} isReady - Whether a valid draft is available.
     */
    function setDraftReady(isReady) {
        hasGeneratedDraft = isReady;

        copyButton.disabled = !isReady;
        printButton.disabled = !isReady;
        resetButton.hidden = !isReady;
        draftWarning.hidden = !isReady;
    }

    /**
     * MEMBER 3 CHANGE:
     * Invalidate the old result if the user edits any form information after
     * generating a draft. This prevents copying or printing outdated text.
     */
    function invalidateDraft() {
        formStatus.textContent = '';
        copyStatus.textContent = '';

        if (!hasGeneratedDraft) {
            return;
        }

        setDraftReady(false);

        showPlaceholder(
            'Your details changed. Select “Generate draft” to create an ' +
            'updated notice.'
        );
    }

    /**
     * MEMBER 3 CHANGE:
     * Build and display a valid draft.
     */
    function generateDraft() {
        output.textContent = buildLetter();
        setDraftReady(true);

        formStatus.textContent =
            'Draft generated. Review it carefully before use.';

        /*
         * Move programmatic focus to the result so keyboard and screen-reader
         * users can locate it.
         */
        output.focus();
    }

    /**
     * MEMBER 3 CHANGE:
     * Reset the form, validation state, preview and available actions.
     */
    function resetGenerator() {
        form.reset();
        updateVisibleFields();
        setDraftReady(false);

        formStatus.textContent = '';
        copyStatus.textContent = '';

        showPlaceholder(
            'Complete the required fields and select “Generate draft”.'
        );

        fields.senderName.focus();
    }

    /**
     * MEMBER 3 CHANGE:
     * Validate and generate only when the form is submitted.
     */
    form.addEventListener('submit', function (event) {
        event.preventDefault();

        formStatus.textContent = '';
        copyStatus.textContent = '';

        if (!form.checkValidity()) {
            formStatus.textContent =
                'Complete all required fields before generating the draft.';

            /*
             * Display the browser's validation message and focus the first
             * invalid field.
             */
            form.reportValidity();
            return;
        }

        generateDraft();
    });

    /*
     * MEMBER 3 CHANGE:
     * If a generated draft exists and the form changes, invalidate that draft.
     */
    form.addEventListener('input', invalidateDraft);

    /*
     * MEMBER 3 CHANGE:
     * Update conditional fields whenever the notice type changes.
     */
    typeSelect.addEventListener('change', function () {
        updateVisibleFields();
        invalidateDraft();
    });

    /*
     * Copy is available only when an up-to-date draft exists.
     */
    copyButton.addEventListener('click', async function () {
        if (!hasGeneratedDraft) {
            return;
        }

        try {
            await navigator.clipboard.writeText(output.textContent);

            copyStatus.textContent =
                'Draft copied to the clipboard.';
        } catch (error) {
            copyStatus.textContent =
                'The draft could not be copied automatically. ' +
                'Select and copy the text manually.';
        }

        window.setTimeout(function () {
            copyStatus.textContent = '';
        }, 4000);
    });

    /*
     * Print is available only when an up-to-date draft exists.
     */
    printButton.addEventListener('click', function () {
        if (hasGeneratedDraft) {
            window.print();
        }
    });

    /*
     * MEMBER 3 CHANGE:
     * Allow the user to begin another notice.
     */
    resetButton.addEventListener('click', resetGenerator);

    /*
     * Initial page state.
     */
    updateVisibleFields();
    setDraftReady(false);

    showPlaceholder(
        'Complete the required fields and select “Generate draft”.'
    );
})();