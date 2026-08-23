/*
 * MEMBER 3 CHANGE:
 * Displays the authenticated user in a dropdown profile menu,
 * provides logout functionality, displays the custom avatar,
 * and handles invalid or expired authentication tokens.
 */

(function () {
    'use strict';

    const TOKEN_KEY = 'access_token';

    /**
     * Finds the existing Sign Up / Login navigation link.
     */
    function findAuthLink() {
        return document.querySelector(
            '.primary-navigation .nav-link--button[href="auth.html"]'
        );
    }

    /**
     * Restores the normal Sign Up / Login navigation.
     */
    function showLoggedOutNavigation(container) {
        if (!container) {
            return;
        }

        container.replaceChildren();
        container.classList.remove(
            'nav-auth-actions',
            'nav-profile'
        );

        const authLink = document.createElement('a');
        authLink.className = 'nav-link nav-link--button';
        authLink.href = 'auth.html';
        authLink.textContent = 'Sign Up / Login';

        container.appendChild(authLink);
    }

    /**
     * Removes the stored JWT and returns to the homepage.
     */
    function logout(container) {
        window.localStorage.removeItem(TOKEN_KEY);
        showLoggedOutNavigation(container);
        window.location.href = 'index.html';
    }

    /**
     * Returns the user's name or an email-based fallback.
     */
    function getDisplayName(user) {
        if (
            user &&
            typeof user.name === 'string' &&
            user.name.trim()
        ) {
            return user.name.trim();
        }

        if (
            user &&
            typeof user.email === 'string' &&
            user.email.trim()
        ) {
            return user.email.trim().split('@')[0];
        }

        return 'User';
    }

    /**
     * Closes the profile dropdown.
     */
    function closeProfileMenu(trigger, menu, returnFocus) {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');

        if (returnFocus) {
            trigger.focus();
        }
    }

    /**
     * Creates the authenticated profile dropdown.
     */
    function showLoggedInNavigation(container, user) {
        if (!container || !user) {
            return;
        }

        const displayName = getDisplayName(user);

        const email =
            typeof user.email === 'string'
                ? user.email.trim()
                : '';

        container.replaceChildren();
        container.classList.remove('nav-auth-actions');
        container.classList.add('nav-profile');

        /*
         * Profile dropdown trigger.
         */
        const trigger = document.createElement('button');
        trigger.className = 'nav-profile__trigger';
        trigger.type = 'button';
        trigger.setAttribute('aria-haspopup', 'menu');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute(
            'aria-label',
            'Open account menu for ' + displayName
        );

        /*
         * Custom animal avatar.
         */
        const userIcon = document.createElement('img');
        userIcon.className = 'nav-user-icon';
        userIcon.src = '/assets/user-avatar.png';
        userIcon.alt = '';
        userIcon.width = 32;
        userIcon.height = 32;
        userIcon.draggable = false;
        userIcon.setAttribute('aria-hidden', 'true');

        /*
         * Authenticated user's display name.
         */
        const userName = document.createElement('span');
        userName.className = 'nav-user-name';
        userName.textContent = displayName;

        /*
         * Dropdown arrow.
         */
        const chevron = document.createElement('span');
        chevron.className = 'nav-profile__chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '▾';

        trigger.append(
            userIcon,
            userName,
            chevron
        );

        /*
         * Profile dropdown menu.
         */
        const menu = document.createElement('div');
        menu.className = 'nav-profile__menu';
        menu.setAttribute('role', 'menu');
        menu.hidden = true;

        /*
         * User account summary.
         */
        const summary = document.createElement('div');
        summary.className = 'nav-profile__summary';

        const summaryName = document.createElement('strong');
        summaryName.textContent = displayName;

        const summaryEmail = document.createElement('span');
        summaryEmail.textContent = email;

        summary.appendChild(summaryName);

        if (email) {
            summary.appendChild(summaryEmail);
        }

        /*
         * Existing Legal FAQ feature.
         */
        const faqLink = document.createElement('a');
        faqLink.href = 'faq.html';
        faqLink.setAttribute('role', 'menuitem');
        faqLink.textContent = 'Legal FAQ / Help';

        /*
         * Logout action.
         */
        const logoutButton = document.createElement('button');
        logoutButton.className = 'nav-profile__logout';
        logoutButton.type = 'button';
        logoutButton.setAttribute('role', 'menuitem');
        logoutButton.textContent = 'Log Out';

        logoutButton.addEventListener('click', function () {
            logout(container);
        });

        /*
         * Attribution required for the Flaticon avatar.
         */
        const avatarCredit = document.createElement('a');
        avatarCredit.className = 'nav-profile__credit';
        avatarCredit.href =
            'https://www.flaticon.com/free-icons/animals';
        avatarCredit.target = '_blank';
        avatarCredit.rel = 'noopener noreferrer';
        avatarCredit.textContent =
            'Animals icons created by Magnific - Flaticon';

        /*
         * Assemble the dropdown menu.
         */
        menu.append(
            summary,
            faqLink,
            logoutButton,
            avatarCredit
        );

        /*
         * Add the trigger and menu to the existing navigation item.
         */
        container.append(
            trigger,
            menu
        );

        /*
         * Opens or closes the dropdown.
         */
        trigger.addEventListener('click', function (event) {
            event.stopPropagation();

            const isOpening = menu.hidden;

            menu.hidden = !isOpening;
            trigger.setAttribute(
                'aria-expanded',
                String(isOpening)
            );
        });

        /*
         * Prevents menu clicks from immediately closing it.
         */
        menu.addEventListener('click', function (event) {
            event.stopPropagation();
        });

        /*
         * Closes the menu when clicking outside.
         */
        document.addEventListener('click', function () {
            closeProfileMenu(
                trigger,
                menu,
                false
            );
        });

        /*
         * Closes the menu when Escape is pressed.
         */
        document.addEventListener('keydown', function (event) {
            if (
                event.key === 'Escape' &&
                !menu.hidden
            ) {
                closeProfileMenu(
                    trigger,
                    menu,
                    true
                );
            }
        });
    }

    /**
     * Loads the authenticated user from the backend.
     */
    async function loadCurrentUser() {
        const authLink = findAuthLink();

        if (!authLink) {
            return;
        }

        const container = authLink.closest('li');

        if (!container) {
            return;
        }

        const token =
            window.localStorage.getItem(TOKEN_KEY);

        /*
         * Keep the standard authentication link when logged out.
         */
        if (!token) {
            showLoggedOutNavigation(container);
            return;
        }

        try {
            const response = await window.fetch(
                '/api/auth/me',
                {
                    method: 'GET',
                    headers: {
                        Authorization: 'Bearer ' + token,
                        Accept: 'application/json',
                    },
                }
            );

            /*
             * Remove invalid or expired tokens.
             */
            if (
                response.status === 401 ||
                response.status === 403
            ) {
                window.localStorage.removeItem(TOKEN_KEY);
                showLoggedOutNavigation(container);
                return;
            }

            /*
             * Do not remove potentially valid tokens during
             * temporary backend failures.
             */
            if (!response.ok) {
                throw new Error(
                    'Unable to retrieve the authenticated user. ' +
                    'Status: ' +
                    response.status
                );
            }

            const user = await response.json();

            const hasName =
                user &&
                typeof user.name === 'string' &&
                Boolean(user.name.trim());

            const hasEmail =
                user &&
                typeof user.email === 'string' &&
                Boolean(user.email.trim());

            if (!hasName && !hasEmail) {
                console.error(
                    'The authenticated user response contains ' +
                    'no valid name or email.'
                );

                showLoggedOutNavigation(container);
                return;
            }

            showLoggedInNavigation(
                container,
                user
            );
        } catch (error) {
            /*
             * Keep the token during temporary network failures.
             */
            console.error(
                'Unable to load the current user:',
                error
            );

            showLoggedOutNavigation(container);
        }
    }

    /*
     * The script normally uses defer, but this also works
     * if defer is accidentally removed.
     */
    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            loadCurrentUser
        );
    } else {
        loadCurrentUser();
    }
})();