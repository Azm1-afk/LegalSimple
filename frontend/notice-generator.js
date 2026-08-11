(function () {
    const form = document.getElementById('notice-form');
    const output = document.getElementById('letter-output');
    const copyButton = document.getElementById('copy-button');
    const printButton = document.getElementById('print-button');
    const copyStatus = document.getElementById('copy-status');

    if (!form || !output || !copyButton || !printButton || !copyStatus) {
        return;
    }

    const typeSelect = form.querySelector('#notice-type');
    const typeFields = form.querySelectorAll('.type-field');

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

    if (!typeSelect || Object.values(fields).some((field) => !field)) {
        return;
    }

    const titles = {
        demand: 'DEMAND LETTER',
        cease: 'CEASE AND DESIST NOTICE',
        vacate: 'NOTICE TO VACATE',
        reminder: 'LEGAL REMINDER NOTICE',
        general: 'LEGAL NOTICE',
    };

    function formatDate(value) {
        if (!value) return '[date]';
        const d = new Date(value + 'T00:00:00');
        if (Number.isNaN(d.getTime())) return value;
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function updateVisibleFields() {
        const type = typeSelect.value;
        typeFields.forEach((field) => {
            const types = field.dataset.type.split(' ');
            field.hidden = !types.includes(type);
        });
    }

    function closingLine(type) {
        switch (type) {
            case 'demand':
                return 'Please treat this letter as formal notice of the above. I trust this matter can be resolved without the need for further action.';
            case 'cease':
                return 'This letter serves as formal notice to stop the above conduct immediately. Failure to do so may result in further legal steps being considered.';
            case 'vacate':
                return 'Please treat this as formal notice to vacate the premises by the date above and to leave them in good condition.';
            case 'reminder':
                return 'This is a reminder of the obligation described above. Please respond or take the necessary action at your earliest convenience.';
            default:
                return 'Please treat this letter as formal notice of the above matter.';
        }
    }

    function buildLetter() {
        const type = typeSelect.value;
        const lines = [];

        lines.push(fields.senderName.value.trim() || '[Your name]');
        if (fields.senderAddress.value.trim()) lines.push(fields.senderAddress.value.trim());
        lines.push('');
        lines.push(formatDate(fields.date.value));
        lines.push('');
        lines.push('To:');
        lines.push(fields.recipientName.value.trim() || '[Recipient name]');
        if (fields.recipientAddress.value.trim()) lines.push(fields.recipientAddress.value.trim());
        lines.push('');

        lines.push(`Subject: ${fields.subject.value.trim() || titles[type]}`);
        lines.push('');
        lines.push(`Dear ${fields.recipientName.value.trim() || 'Sir/Madam'},`);
        lines.push('');

        if (type === 'demand' && fields.amountDue.value.trim()) {
            lines.push(`This letter concerns an outstanding amount of ${fields.amountDue.value.trim()}.`);
            lines.push('');
        }

        if (fields.body.value.trim()) {
            lines.push(fields.body.value.trim());
            lines.push('');
        }

        if ((type === 'demand' || type === 'vacate') && fields.dueDate.value) {
            const label = type === 'vacate' ? 'vacate the premises' : 'settle this matter';
            lines.push(`Please ${label} by ${formatDate(fields.dueDate.value)}.`);
            lines.push('');
        }

        lines.push(closingLine(type));
        lines.push('');
        lines.push('Sincerely,');
        lines.push(fields.senderName.value.trim() || '[Your name]');

        return lines.join('\n');
    }

    function render() {
        const text = buildLetter();
        output.textContent = text;
        output.classList.remove('letter-placeholder');
    }

    form.addEventListener('input', render);
    typeSelect.addEventListener('change', () => {
        updateVisibleFields();
        render();
    });

    copyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(output.textContent);
            copyStatus.textContent = 'Copied to clipboard.';
        } catch (err) {
            copyStatus.textContent = 'Could not copy automatically — please select and copy the text manually.';
        }
        setTimeout(() => { copyStatus.textContent = ''; }, 4000);
    });

    printButton.addEventListener('click', () => window.print());

    updateVisibleFields();
    render();
})();
