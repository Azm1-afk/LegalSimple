(function () {
    'use strict';

    const page = document.querySelector('.auth-page');

    if (!page) {
        return;
    }

    const elements = {
        heading: document.getElementById('auth-heading'),
        description: document.getElementById('auth-description'),
        tabs: Array.from(document.querySelectorAll('[data-auth-mode]')),
        panels: {
            signup: document.getElementById('signup-panel'),
            login: document.getElementById('login-panel'),
        },
        forms: {
            signup: document.getElementById('signup-form'),
            login: document.getElementById('login-form'),
        },
        signupEmail: document.getElementById('signup-email'),
        signupPassword: document.getElementById('signup-password'),
        signupConfirmation: document.getElementById('signup-confirm-password'),
        loginEmail: document.getElementById('login-email'),
        loginPassword: document.getElementById('login-password'),
        passwordToggles: Array.from(document.querySelectorAll('.auth-password-toggle')),
        switchButtons: Array.from(document.querySelectorAll('[data-auth-switch]')),
        googleButtons: Array.from(document.querySelectorAll('[data-google-signin]')),
        statuses: {
            signup: document.getElementById('signup-status'),
            login: document.getElementById('login-status'),
        },
        requirementItems: Array.from(document.querySelectorAll('[data-password-requirement]')),
    };

    if (
        !elements.heading ||
        !elements.description ||
        !elements.panels.signup ||
        !elements.panels.login ||
        !elements.forms.signup ||
        !elements.forms.login ||
        !elements.signupEmail ||
        !elements.signupPassword ||
        !elements.signupConfirmation ||
        !elements.loginEmail ||
        !elements.loginPassword ||
        !elements.statuses.signup ||
        !elements.statuses.login ||
        elements.tabs.length !== 2 ||
        elements.passwordToggles.length !== 3 ||
        elements.googleButtons.length !== 2 ||
        elements.requirementItems.length !== 4
    ) {
        return;
    }

    const modeContent = {
        signup: {
            heading: 'Create your LegalSimple account',
            description: 'Enter your email address and review the password requirements.',
        },
        login: {
            heading: 'Welcome back',
            description: 'Enter your email address and password.',
        },
    };

    const passwordRequirements = {
        length: {
            label: 'At least 8 characters',
            test: function (password) {
                return password.length >= 8;
            },
        },
        uppercase: {
            label: 'One uppercase letter',
            test: function (password) {
                return /[A-Z]/.test(password);
            },
        },
        lowercase: {
            label: 'One lowercase letter',
            test: function (password) {
                return /[a-z]/.test(password);
            },
        },
        number: {
            label: 'One number',
            test: function (password) {
                return /[0-9]/.test(password);
            },
        },
    };

    let activeMode = 'signup';

    function validateEmail(email) {
        const value = email.trim();

        if (!value) {
            return 'Enter your email address.';
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            return 'Enter a valid email address.';
        }

        return '';
    }

    function getSignupPasswordResults(password) {
        return Object.keys(passwordRequirements).reduce(function (results, requirementName) {
            results[requirementName] = passwordRequirements[requirementName].test(password);
            return results;
        }, {});
    }

    function validateSignupPassword(password) {
        if (!password) {
            return 'Enter a password.';
        }

        const results = getSignupPasswordResults(password);
        const meetsEveryRequirement = Object.keys(results).every(function (requirementName) {
            return results[requirementName];
        });

        return meetsEveryRequirement ? '' : 'Use a password that meets all listed requirements.';
    }

    function validatePasswordConfirmation(password, confirmation) {
        if (!confirmation) {
            return 'Confirm your password.';
        }

        if (password !== confirmation) {
            return 'The passwords do not match.';
        }

        return '';
    }

    function updatePasswordRequirements(password) {
        const results = getSignupPasswordResults(password);

        elements.requirementItems.forEach(function (item) {
            const requirementName = item.dataset.passwordRequirement;
            const requirement = passwordRequirements[requirementName];

            if (!requirement) {
                return;
            }

            const isMet = results[requirementName];
            item.classList.toggle('is-met', isMet);
        });
    }

    function getFieldError(input) {
        return document.getElementById(input.id + '-error');
    }

    function showFieldError(input, message) {
        const error = getFieldError(input);

        if (!error) {
            return;
        }

        input.setAttribute('aria-invalid', 'true');
        error.textContent = 'Error: ' + message;
        error.hidden = false;
    }

    function clearFieldError(input) {
        const error = getFieldError(input);

        input.removeAttribute('aria-invalid');

        if (error) {
            error.textContent = '';
            error.hidden = true;
        }
    }

    function applyFieldValidation(input, message) {
        if (message) {
            showFieldError(input, message);
            return false;
        }

        clearFieldError(input);
        return true;
    }

    function clearAllFieldErrors() {
        [
            elements.signupEmail,
            elements.signupPassword,
            elements.signupConfirmation,
            elements.loginEmail,
            elements.loginPassword,
        ].forEach(clearFieldError);
    }

    function showAuthStatus(mode, message, type) {
        const status = elements.statuses[mode];

        if (!status) {
            return;
        }

        status.className = 'auth-status' + (type ? ' is-' + type : '');
        status.textContent = message;
    }

    function clearAuthStatuses() {
        Object.keys(elements.statuses).forEach(function (mode) {
            showAuthStatus(mode, '', '');
        });
    }

    function resetPasswordToggle(input, button) {
        const fieldName = input.id.indexOf('confirm') === -1 ? 'password' : 'confirm password';

        input.type = 'password';
        button.textContent = 'Show';
        button.setAttribute('aria-label', 'Show ' + fieldName);
        button.setAttribute('aria-pressed', 'false');
    }

    function clearSensitiveFields() {
        elements.passwordToggles.forEach(function (button) {
            const inputId = button.getAttribute('aria-controls');
            const input = inputId ? document.getElementById(inputId) : null;

            if (!input) {
                return;
            }

            input.value = '';
            resetPasswordToggle(input, button);
        });

        updatePasswordRequirements('');
    }

    function updateLocationHash(mode) {
        if (!window.history || typeof window.history.replaceState !== 'function') {
            return;
        }

        try {
            window.history.replaceState(null, '', '#' + mode);
        } catch (error) {
            // The form remains fully usable if a local browser blocks history updates.
        }
    }

    function switchAuthMode(mode, options) {
        if (!modeContent[mode]) {
            return;
        }

        const settings = Object.assign({ focusTab: false, updateHash: true }, options);
        activeMode = mode;
        clearSensitiveFields();
        clearAllFieldErrors();
        clearAuthStatuses();

        elements.tabs.forEach(function (tab) {
            const isActive = tab.dataset.authMode === mode;
            tab.classList.toggle('is-active', isActive);
            tab.setAttribute('aria-selected', String(isActive));
            tab.tabIndex = isActive ? 0 : -1;

            if (isActive && settings.focusTab) {
                tab.focus();
            }
        });

        Object.keys(elements.panels).forEach(function (panelMode) {
            elements.panels[panelMode].hidden = panelMode !== mode;
        });

        elements.heading.textContent = modeContent[mode].heading;
        elements.description.textContent = modeContent[mode].description;

        if (settings.updateHash) {
            updateLocationHash(mode);
        }
    }

    function togglePasswordVisibility(input, button) {
        const willShow = input.type === 'password';
        const fieldName = input.id.indexOf('confirm') === -1 ? 'password' : 'confirm password';

        input.type = willShow ? 'text' : 'password';
        button.textContent = willShow ? 'Hide' : 'Show';
        button.setAttribute('aria-label', (willShow ? 'Hide ' : 'Show ') + fieldName);
        button.setAttribute('aria-pressed', String(willShow));
    }

        function validateSignupForm(event) {
        event.preventDefault();
        clearAuthStatuses();

        elements.signupEmail.value = elements.signupEmail.value.trim();

        const validations = [
            {
                input: elements.signupEmail,
                message: validateEmail(elements.signupEmail.value),
            },
            {
                input: elements.signupPassword,
                message: validateSignupPassword(elements.signupPassword.value),
            },
            {
                input: elements.signupConfirmation,
                message: validatePasswordConfirmation(
                    elements.signupPassword.value,
                    elements.signupConfirmation.value
                ),
            },
        ];

        const invalidFields = validations.filter(function (validation) {
            return !applyFieldValidation(validation.input, validation.message);
        });

        if (invalidFields.length > 0) {
            const fieldLabel = invalidFields.length === 1 ? 'field' : 'fields';
            showAuthStatus(
                'signup',
                'Please correct ' + invalidFields.length + ' highlighted ' + fieldLabel + '.',
                'error'
            );
            invalidFields[0].input.focus();
            return;
        }

        showAuthStatus('signup', 'Creating your account...', 'info');

        fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: elements.signupEmail.value.split('@')[0],
                email: elements.signupEmail.value,
                password: elements.signupPassword.value,
            }),
        })
            .then(function (response) {
                return response.json().then(function (data) {
                    return { ok: response.ok, data: data };
                });
            })
            .then(function (result) {
                if (!result.ok) {
                    const detail = result.data && result.data.detail
                        ? result.data.detail
                        : 'Sign-up failed. Please try again.';
                    showAuthStatus('signup', detail, 'error');
                    return;
                }

                showAuthStatus('signup', 'Account created! You can now log in.', 'success');
                clearSensitiveFields();
                switchAuthMode('login', { focusTab: true });
            })
            .catch(function () {
                showAuthStatus('signup', 'Network error. Please try again.', 'error');
            });
    }

        function validateLoginForm(event) {
        event.preventDefault();
        clearAuthStatuses();

        elements.loginEmail.value = elements.loginEmail.value.trim();

        const validations = [
            {
                input: elements.loginEmail,
                message: validateEmail(elements.loginEmail.value),
            },
            {
                input: elements.loginPassword,
                message: elements.loginPassword.value ? '' : 'Enter your password.',
            },
        ];

        const invalidFields = validations.filter(function (validation) {
            return !applyFieldValidation(validation.input, validation.message);
        });

        if (invalidFields.length > 0) {
            const fieldLabel = invalidFields.length === 1 ? 'field' : 'fields';
            showAuthStatus(
                'login',
                'Please correct ' + invalidFields.length + ' highlighted ' + fieldLabel + '.',
                'error'
            );
            invalidFields[0].input.focus();
            return;
        }

        showAuthStatus('login', 'Logging in...', 'info');

        fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: elements.loginEmail.value,
                password: elements.loginPassword.value,
            }),
        })
            .then(function (response) {
                return response.json().then(function (data) {
                    return { ok: response.ok, data: data };
                });
            })
            .then(function (result) {
                if (!result.ok) {
                    const detail = result.data && result.data.detail
                        ? result.data.detail
                        : 'Login failed. Please try again.';
                    showAuthStatus('login', detail, 'error');
                    return;
                }

                localStorage.setItem('access_token', result.data.access_token);
                showAuthStatus('login', 'Logged in successfully!', 'success');
                clearSensitiveFields();

                setTimeout(function () {
                    window.location.href = 'index.html';
                }, 800);
            })
            .catch(function () {
                showAuthStatus('login', 'Network error. Please try again.', 'error');
            });
    }

    function handleGoogleSignIn() {
        clearAuthStatuses();
        showAuthStatus(
            activeMode,
            'Google sign-in was not completed.',
            'info'
        );
    }

    function handleTabKeydown(event) {
        const currentIndex = elements.tabs.indexOf(event.currentTarget);
        let nextIndex = currentIndex;

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            nextIndex = (currentIndex + 1) % elements.tabs.length;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            nextIndex = (currentIndex - 1 + elements.tabs.length) % elements.tabs.length;
        } else if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = elements.tabs.length - 1;
        } else {
            return;
        }

        event.preventDefault();
        switchAuthMode(elements.tabs[nextIndex].dataset.authMode, { focusTab: true });
    }

    function initializeAuthPage() {
        elements.tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                switchAuthMode(tab.dataset.authMode);
            });
            tab.addEventListener('keydown', handleTabKeydown);
        });

        elements.switchButtons.forEach(function (button) {
            button.addEventListener('click', function () {
                switchAuthMode(button.dataset.authSwitch, { focusTab: true });
            });
        });

        elements.passwordToggles.forEach(function (button) {
            button.addEventListener('click', function () {
                const inputId = button.getAttribute('aria-controls');
                const input = inputId ? document.getElementById(inputId) : null;

                if (input) {
                    togglePasswordVisibility(input, button);
                }
            });
        });

        elements.googleButtons.forEach(function (button) {
            button.addEventListener('click', handleGoogleSignIn);
        });

        elements.forms.signup.addEventListener('submit', validateSignupForm);
        elements.forms.login.addEventListener('submit', validateLoginForm);

        [elements.signupEmail, elements.loginEmail].forEach(function (input) {
            input.addEventListener('blur', function () {
                input.value = input.value.trim();
                applyFieldValidation(input, validateEmail(input.value));
            });
            input.addEventListener('input', function () {
                clearAuthStatuses();

                if (input.hasAttribute('aria-invalid')) {
                    applyFieldValidation(input, validateEmail(input.value));
                }
            });
        });

        elements.signupPassword.addEventListener('input', function () {
            clearAuthStatuses();
            updatePasswordRequirements(elements.signupPassword.value);

            if (elements.signupPassword.hasAttribute('aria-invalid')) {
                applyFieldValidation(
                    elements.signupPassword,
                    validateSignupPassword(elements.signupPassword.value)
                );
            }

            if (
                elements.signupConfirmation.value ||
                elements.signupConfirmation.hasAttribute('aria-invalid')
            ) {
                applyFieldValidation(
                    elements.signupConfirmation,
                    validatePasswordConfirmation(
                        elements.signupPassword.value,
                        elements.signupConfirmation.value
                    )
                );
            }
        });

        elements.signupPassword.addEventListener('blur', function () {
            applyFieldValidation(
                elements.signupPassword,
                validateSignupPassword(elements.signupPassword.value)
            );
        });

        elements.signupConfirmation.addEventListener('input', function () {
            clearAuthStatuses();

            if (elements.signupConfirmation.hasAttribute('aria-invalid')) {
                applyFieldValidation(
                    elements.signupConfirmation,
                    validatePasswordConfirmation(
                        elements.signupPassword.value,
                        elements.signupConfirmation.value
                    )
                );
            }
        });

        elements.signupConfirmation.addEventListener('blur', function () {
            applyFieldValidation(
                elements.signupConfirmation,
                validatePasswordConfirmation(
                    elements.signupPassword.value,
                    elements.signupConfirmation.value
                )
            );
        });

        elements.loginPassword.addEventListener('input', function () {
            clearAuthStatuses();

            if (elements.loginPassword.hasAttribute('aria-invalid')) {
                applyFieldValidation(
                    elements.loginPassword,
                    elements.loginPassword.value ? '' : 'Enter your password.'
                );
            }
        });

        elements.loginPassword.addEventListener('blur', function () {
            applyFieldValidation(
                elements.loginPassword,
                elements.loginPassword.value ? '' : 'Enter your password.'
            );
        });

        const initialMode = window.location.hash.toLowerCase() === '#login' ? 'login' : 'signup';
        switchAuthMode(initialMode, { updateHash: false });
    }

    initializeAuthPage();
})();
