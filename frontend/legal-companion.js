(function () {
    "use strict";

    if (document.querySelector(".legal-companion")) {
        return;
    }

    const welcomeMessage = "Hello. I’m the LegalSimple Legal Companion. I can help you understand general legal topics and answer questions about an uploaded document.";
    const genericErrorMessage = "Sorry, the Legal AI Companion could not process your request. Please try again.";
    const historyStorageKey = "legalsimple-companion-history";
    const documentStorageKey = "legalsimple-companion-document";
    const maximumStoredMessages = 30;
    const maximumApiHistoryMessages = 12;
    const maximumUploadBytes = 10 * 1024 * 1024;
    const supportedExtensions = ["pdf", "docx", "txt"];

    class CompanionApiError extends Error {}

    function getApiBaseUrl() {
        if (typeof window.LEGALSIMPLE_API_BASE_URL === "string") {
            return window.LEGALSIMPLE_API_BASE_URL.replace(/\/$/, "");
        }

        const isLocalHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        if (isLocalHost && window.location.port !== "8000") {
            return `${window.location.protocol}//${window.location.hostname}:8000`;
        }
        if (window.location.protocol === "http:" || window.location.protocol === "https:") {
            return window.location.origin;
        }
        return "http://127.0.0.1:8000";
    }

    const apiBaseUrl = getApiBaseUrl();
    const companion = document.createElement("aside");
    companion.className = "legal-companion";
    companion.setAttribute("aria-label", "LegalSimple Legal Companion");
    companion.innerHTML = `
        <section
            class="legal-companion__panel"
            id="legal-companion-panel"
            role="dialog"
            aria-modal="false"
            aria-labelledby="legal-companion-title"
            aria-describedby="legal-companion-disclaimer"
            hidden
        >
            <header class="legal-companion__header">
                <div class="legal-companion__identity">
                    <h2 class="legal-companion__title" id="legal-companion-title">LegalSimple Legal Companion</h2>
                    <p class="legal-companion__status" aria-label="Status: Available">
                        <span class="legal-companion__status-indicator" aria-hidden="true"></span>
                        Available
                    </p>
                </div>
                <button class="legal-companion__close" type="button" aria-label="Close Legal Companion">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
                    </svg>
                </button>
            </header>
            <div
                class="legal-companion__messages"
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                aria-label="Conversation history"
            >
                <div class="legal-companion__message legal-companion__message--assistant">
                    <span class="legal-companion__message-author">Legal Companion</span>
                    <p class="legal-companion__message-text"></p>
                </div>
            </div>
            <div class="legal-companion__composer">
                <div class="legal-companion__attachment" role="status" hidden>
                    <svg class="legal-companion__attachment-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M7 3h7l4 4v14H7zM14 3v5h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
                    </svg>
                    <span class="legal-companion__attachment-details">
                        <span class="legal-companion__attachment-name"></span>
                        <span class="legal-companion__attachment-status"></span>
                    </span>
                    <button class="legal-companion__attachment-remove" type="button" aria-label="Remove attached document" title="Remove document">
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
                        </svg>
                    </button>
                </div>
                <form class="legal-companion__form" novalidate>
                    <input
                        class="legal-companion__file-input"
                        id="legal-companion-file"
                        type="file"
                        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                        hidden
                    >
                    <button class="legal-companion__upload" type="button" aria-label="Upload document" title="Upload document">
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M8.5 12.5 14 7a3 3 0 0 1 4.2 4.2l-7.4 7.4a5 5 0 0 1-7.1-7.1l7.1-7.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                    </button>
                    <label class="legal-companion__sr-only" for="legal-companion-input">Message Legal Companion</label>
                    <input
                        class="legal-companion__input"
                        id="legal-companion-input"
                        name="legal-companion-message"
                        type="text"
                        placeholder="Ask LegalSimple..."
                        autocomplete="off"
                        maxlength="8000"
                        required
                    >
                    <button class="legal-companion__send" type="submit">Send</button>
                </form>
                <p class="legal-companion__disclaimer" id="legal-companion-disclaimer">
                    General legal information only — not professional legal advice.
                </p>
            </div>
        </section>
        <button
            class="legal-companion__launcher"
            type="button"
            aria-label="Open Legal Companion"
            aria-expanded="false"
            aria-controls="legal-companion-panel"
        >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 17.5 3.8 21l4.1-1.8c1.2.5 2.6.8 4.1.8 5 0 9-3.6 9-8s-4-8-9-8-9 3.6-9 8c0 2.1.8 4 2 5.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
                <path d="M8 12h8M8 9h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
            <span>Legal Companion</span>
        </button>
    `;

    document.body.appendChild(companion);

    const panel = companion.querySelector(".legal-companion__panel");
    const launcher = companion.querySelector(".legal-companion__launcher");
    const closeButton = companion.querySelector(".legal-companion__close");
    const form = companion.querySelector(".legal-companion__form");
    const input = companion.querySelector(".legal-companion__input");
    const sendButton = companion.querySelector(".legal-companion__send");
    const uploadButton = companion.querySelector(".legal-companion__upload");
    const fileInput = companion.querySelector(".legal-companion__file-input");
    const messages = companion.querySelector(".legal-companion__messages");
    const welcomeText = companion.querySelector(".legal-companion__message-text");
    const attachment = companion.querySelector(".legal-companion__attachment");
    const attachmentName = companion.querySelector(".legal-companion__attachment-name");
    const attachmentStatus = companion.querySelector(".legal-companion__attachment-status");
    const attachmentRemove = companion.querySelector(".legal-companion__attachment-remove");

    let isBusy = false;
    let chatHistory = loadChatHistory();
    let currentDocument = loadCurrentDocument();

    welcomeText.textContent = welcomeMessage;
    renderStoredHistory();
    if (currentDocument) {
        showAttachment(currentDocument.filename, "Ready", "ready");
    }

    function loadStoredValue(storageKey) {
        try {
            const storedValue = window.localStorage.getItem(storageKey);
            return storedValue ? JSON.parse(storedValue) : null;
        } catch (error) {
            return null;
        }
    }

    function loadChatHistory() {
        const storedHistory = loadStoredValue(historyStorageKey);
        if (!Array.isArray(storedHistory)) {
            return [];
        }

        return storedHistory.filter(function (message) {
            return message
                && (message.role === "user" || message.role === "assistant")
                && typeof message.content === "string"
                && message.content.trim();
        }).slice(-maximumStoredMessages);
    }

    function loadCurrentDocument() {
        const storedDocument = loadStoredValue(documentStorageKey);
        if (!storedDocument
            || typeof storedDocument.document_id !== "string"
            || typeof storedDocument.filename !== "string") {
            return null;
        }
        return storedDocument;
    }

    function saveChatHistory() {
        chatHistory = chatHistory.slice(-maximumStoredMessages);
        try {
            window.localStorage.setItem(historyStorageKey, JSON.stringify(chatHistory));
        } catch (error) {
            // The chat remains usable when browser storage is unavailable.
        }
    }

    function saveCurrentDocument() {
        try {
            if (currentDocument) {
                window.localStorage.setItem(documentStorageKey, JSON.stringify(currentDocument));
            } else {
                window.localStorage.removeItem(documentStorageKey);
            }
        } catch (error) {
            // The attachment remains usable on the current page without storage.
        }
    }

    function renderStoredHistory() {
        chatHistory.forEach(function (message) {
            const isUser = message.role === "user";
            addMessage(
                isUser ? "You" : "Legal Companion",
                message.content,
                isUser ? "user" : "assistant",
                message.sources || []
            );
        });
        scrollToLatestMessage();
    }

    function setOpen(isOpen) {
        panel.hidden = !isOpen;
        launcher.setAttribute("aria-expanded", String(isOpen));
        launcher.setAttribute("aria-label", isOpen ? "Close Legal Companion" : "Open Legal Companion");

        if (isOpen) {
            window.requestAnimationFrame(function () {
                input.focus();
            });
        } else {
            launcher.focus();
        }
    }

    function setBusy(busy) {
        isBusy = busy;
        panel.setAttribute("aria-busy", String(busy));
        input.disabled = busy;
        sendButton.disabled = busy;
        uploadButton.disabled = busy;
        attachmentRemove.disabled = busy;
    }

    function addMessage(author, text, type, sources, extraClass) {
        const message = document.createElement("div");
        const authorLabel = document.createElement("span");
        const messageText = document.createElement("p");

        message.className = `legal-companion__message legal-companion__message--${type}`;
        if (extraClass) {
            message.classList.add(extraClass);
        }
        authorLabel.className = "legal-companion__message-author";
        messageText.className = "legal-companion__message-text";
        authorLabel.textContent = author;
        messageText.textContent = text;
        message.append(authorLabel, messageText);
        appendSources(message, sources || []);
        messages.appendChild(message);
        scrollToLatestMessage();
        return message;
    }

    function appendSources(message, sources) {
        const validSources = sources.filter(function (source) {
            return source && typeof source.filename === "string" && source.filename;
        });
        if (!validSources.length) {
            return;
        }

        const sourceList = document.createElement("div");
        sourceList.className = "legal-companion__sources";
        validSources.forEach(function (source) {
            const sourceText = document.createElement("span");
            sourceText.className = "legal-companion__source";
            sourceText.textContent = Number.isInteger(source.page_number)
                ? `Source: ${source.filename} — Page ${source.page_number}`
                : `Source: ${source.filename}`;
            sourceList.appendChild(sourceText);
        });
        message.appendChild(sourceList);
    }

    function updateAssistantMessage(message, text, sources) {
        message.classList.remove("legal-companion__message--loading");
        message.querySelector(".legal-companion__message-text").textContent = text;
        const oldSources = message.querySelector(".legal-companion__sources");
        if (oldSources) {
            oldSources.remove();
        }
        appendSources(message, sources || []);
        scrollToLatestMessage();
    }

    function scrollToLatestMessage() {
        messages.scrollTop = messages.scrollHeight;
    }

    function showAttachment(filename, statusText, state) {
        attachment.hidden = false;
        attachment.dataset.state = state;
        attachmentName.textContent = filename;
        attachmentStatus.textContent = statusText;
    }

    function hideAttachment() {
        attachment.hidden = true;
        attachment.removeAttribute("data-state");
        attachmentName.textContent = "";
        attachmentStatus.textContent = "";
    }

    function getFileValidationError(file) {
        const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
        if (!supportedExtensions.includes(extension)) {
            return "Choose a PDF, DOCX, or TXT document.";
        }
        if (file.size === 0) {
            return "The selected document is empty.";
        }
        if (file.size > maximumUploadBytes) {
            return "The selected document is larger than 10 MB.";
        }
        return "";
    }

    async function readApiError(response, fallbackMessage) {
        try {
            const errorBody = await response.json();
            return typeof errorBody.detail === "string" ? errorBody.detail : fallbackMessage;
        } catch (error) {
            return fallbackMessage;
        }
    }

    async function uploadDocument(file) {
        const previousDocument = currentDocument;
        const validationError = getFileValidationError(file);
        if (validationError) {
            if (previousDocument) {
                showAttachment(previousDocument.filename, "Ready", "ready");
            } else {
                showAttachment(file.name, validationError, "error");
            }
            addMessage("Legal Companion", validationError, "assistant", [], "legal-companion__message--error");
            fileInput.value = "";
            return;
        }

        showAttachment(file.name, `Processing ${file.name}...`, "processing");
        setBusy(true);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await window.fetch(`${apiBaseUrl}/api/companion/documents`, {
                method: "POST",
                body: formData
            });
            if (!response.ok) {
                throw new CompanionApiError(
                    await readApiError(response, "The document could not be processed.")
                );
            }

            const uploadedDocument = await response.json();
            if (!uploadedDocument.document_id || !uploadedDocument.filename) {
                throw new CompanionApiError("The document service returned an invalid response.");
            }

            currentDocument = uploadedDocument;
            saveCurrentDocument();
            showAttachment(uploadedDocument.filename, `${uploadedDocument.filename} ready`, "ready");

            if (previousDocument && previousDocument.document_id !== uploadedDocument.document_id) {
                deleteDocumentStore(previousDocument.document_id);
            }
        } catch (error) {
            const errorMessage = error instanceof CompanionApiError
                ? error.message
                : "The document could not be processed. Please check that the backend is running and try again.";
            if (previousDocument) {
                currentDocument = previousDocument;
                saveCurrentDocument();
                showAttachment(previousDocument.filename, "Ready", "ready");
            } else {
                currentDocument = null;
                saveCurrentDocument();
                showAttachment(file.name, errorMessage, "error");
            }
            addMessage("Legal Companion", errorMessage, "assistant", [], "legal-companion__message--error");
        } finally {
            fileInput.value = "";
            setBusy(false);
            input.focus();
        }
    }

    function deleteDocumentStore(documentId) {
        window.fetch(`${apiBaseUrl}/api/companion/documents/${encodeURIComponent(documentId)}`, {
            method: "DELETE"
        }).catch(function () {
            // Backend memory is also cleared automatically when the server restarts.
        });
    }

    function removeCurrentDocument() {
        const documentToRemove = currentDocument;
        currentDocument = null;
        saveCurrentDocument();
        hideAttachment();
        fileInput.value = "";

        if (documentToRemove) {
            deleteDocumentStore(documentToRemove.document_id);
        }
        input.focus();
    }

    launcher.addEventListener("click", function () {
        setOpen(panel.hidden);
    });

    closeButton.addEventListener("click", function () {
        setOpen(false);
    });

    uploadButton.addEventListener("click", function () {
        if (!isBusy) {
            fileInput.click();
        }
    });

    fileInput.addEventListener("change", function () {
        const selectedFile = fileInput.files && fileInput.files[0];
        if (selectedFile) {
            uploadDocument(selectedFile);
        }
    });

    attachmentRemove.addEventListener("click", function () {
        if (!isBusy) {
            removeCurrentDocument();
        }
    });

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (isBusy) {
            return;
        }

        const message = input.value.trim();
        if (!message) {
            input.setCustomValidity("Please enter a message.");
            input.reportValidity();
            input.focus();
            return;
        }

        input.setCustomValidity("");
        const requestHistory = chatHistory.slice(-maximumApiHistoryMessages).map(function (historyMessage) {
            return {role: historyMessage.role, content: historyMessage.content};
        });

        addMessage("You", message, "user", []);
        chatHistory.push({role: "user", content: message});
        saveChatHistory();
        input.value = "";
        setBusy(true);

        const loadingMessage = addMessage(
            "Legal Companion",
            "LegalSimple is thinking...",
            "assistant",
            [],
            "legal-companion__message--loading"
        );

        try {
            const response = await window.fetch(`${apiBaseUrl}/api/companion/chat`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    message: message,
                    document_id: currentDocument ? currentDocument.document_id : null,
                    chat_history: requestHistory
                })
            });

            if (!response.ok) {
                const errorMessage = response.status === 404 && currentDocument
                    ? "The attached document is no longer available. Please upload it again."
                    : await readApiError(response, genericErrorMessage);

                if (response.status === 404 && currentDocument) {
                    currentDocument = null;
                    saveCurrentDocument();
                    hideAttachment();
                }
                throw new CompanionApiError(errorMessage);
            }

            const responseBody = await response.json();
            const answer = typeof responseBody.answer === "string" && responseBody.answer.trim()
                ? responseBody.answer.trim()
                : genericErrorMessage;
            const sources = Array.isArray(responseBody.sources) ? responseBody.sources : [];

            updateAssistantMessage(loadingMessage, answer, sources);
            chatHistory.push({role: "assistant", content: answer, sources: sources});
            saveChatHistory();
        } catch (error) {
            const errorMessage = error instanceof CompanionApiError ? error.message : genericErrorMessage;
            loadingMessage.classList.add("legal-companion__message--error");
            updateAssistantMessage(loadingMessage, errorMessage, []);
        } finally {
            setBusy(false);
            input.focus();
        }
    });

    input.addEventListener("input", function () {
        input.setCustomValidity("");
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !panel.hidden) {
            event.preventDefault();
            setOpen(false);
        }
    });
})();
