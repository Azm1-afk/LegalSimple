(function () {
    "use strict";

    if (document.querySelector(".legal-companion")) {
        return;
    }

    const welcomeMessage = "Hello. I’m the LegalSimple Legal Companion. I can help you understand general legal topics and guide you to the appropriate LegalSimple tools.";
    const companionResponse = "Thank you for your message. I can help you explore LegalSimple’s legal information and available tools.";

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
                aria-relevant="additions"
                aria-label="Conversation history"
            >
                <div class="legal-companion__message legal-companion__message--assistant">
                    <span class="legal-companion__message-author">Legal Companion</span>
                    <p class="legal-companion__message-text"></p>
                </div>
            </div>
            <div class="legal-companion__composer">
                <form class="legal-companion__form" novalidate>
                    <label class="legal-companion__sr-only" for="legal-companion-input">Message Legal Companion</label>
                    <input
                        class="legal-companion__input"
                        id="legal-companion-input"
                        name="legal-companion-message"
                        type="text"
                        placeholder="Type a general legal question"
                        autocomplete="off"
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
    const messages = companion.querySelector(".legal-companion__messages");
    const welcomeText = companion.querySelector(".legal-companion__message-text");

    welcomeText.textContent = welcomeMessage;

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

    function addMessage(author, text, type) {
        const message = document.createElement("div");
        const authorLabel = document.createElement("span");
        const messageText = document.createElement("p");

        message.className = `legal-companion__message legal-companion__message--${type}`;
        authorLabel.className = "legal-companion__message-author";
        messageText.className = "legal-companion__message-text";
        authorLabel.textContent = author;
        messageText.textContent = text;
        message.append(authorLabel, messageText);
        messages.appendChild(message);
    }

    launcher.addEventListener("click", function () {
        setOpen(panel.hidden);
    });

    closeButton.addEventListener("click", function () {
        setOpen(false);
    });

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const message = input.value.trim();

        if (!message) {
            input.setCustomValidity("Please enter a message.");
            input.reportValidity();
            input.focus();
            return;
        }

        input.setCustomValidity("");
        addMessage("You", message, "user");
        addMessage("Legal Companion", companionResponse, "assistant");
        input.value = "";
        messages.scrollTop = messages.scrollHeight;
        input.focus();
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
