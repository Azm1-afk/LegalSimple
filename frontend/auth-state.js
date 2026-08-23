/*
 * MEMBER 3 CHANGE:
 * Displays the authenticated user's name in the shared navigation,
 * provides logout functionality, and handles invalid or expired tokens.
 */

(function () {
    'use strict';

    const TOKEN_KEY = 'access_token';

    /**
     * Finds the existing "Sign Up / Login" navigation link.
     */
    function findAuthLink() {
        return document.querySelector(
            '.primary-navigation .nav-link--button[href="auth.html"]'
        );
    }

    /**
     * Creates and displays the default logged-out navigation link.
     */
    function showLoggedOutNavigation(container) {
        if (!container) {
            return;
        }

        container.replaceChildren();
        container.classList.remove('nav-auth-actions');

        const authLink = document.createElement('a');
        authLink.className = 'nav-link nav-link--button';
        authLink.href = 'auth.html';
        authLink.textContent = 'Sign Up / Login';

        container.appendChild(authLink);
    }

    /**
     * Removes the stored JWT and returns the user to the home page.
     */
    function logout(container) {
        window.localStorage.removeItem(TOKEN_KEY);
        showLoggedOutNavigation(container);
        window.location.href = 'index.html';
    }

    /**
     * Returns a safe name for display in the navigation.
     */
    function getDisplayName(user) {
        if (user && typeof user.name === 'string' && user.name.trim()) {
            return user.name.trim();
        }

        if (user && typeof user.email === 'string' && user.email.trim()) {
            return user.email.trim().split('@')[0];
        }

        return 'User';
    }

    /**
     * Replaces the authentication link with the authenticated user's
     * name, account initial, and logout button.
     */
    function showLoggedInNavigation(container, user) {
        if (!container || !user) {
            return;
        }

        const displayName = getDisplayName(user);

        container.replaceChildren();
        container.classList.add('nav-auth-actions');

        const userDisplay = document.createElement('span');
        userDisplay.className = 'nav-user-display';

        if (typeof user.email === 'string' && user.email.trim()) {
            userDisplay.title = user.email.trim();
        }

        const userIcon = document.createElement('span');
        userIcon.className = 'nav-user-icon';
        userIcon.setAttribute('aria-hidden', 'true');
        userIcon.textContent = displayName.charAt(0).toUpperCase();

        const userName = document.createElement('span');
        userName.className = 'nav-user-name';

        // textContent prevents a user's name from being treated as HTML.
        userName.textContent = displayName;

        const logoutButton = document.createElement('button');
        logoutButton.className = 'nav-logout-button';
        logoutButton.type = 'button';
        logoutButton.textContent = 'Logout';
        logoutButton.setAttribute(
            'aria-label',
            'Log out of the LegalSimple account for ' + displayName
        );

        logoutButton.addEventListener('click', function () {
            logout(container);
        });

        userDisplay.append(userIcon, userName);
        container.append(userDisplay, logoutButton);
    }

    /**
     * Retrieves the authenticated user's information from the backend.
     */
    async function loadCurrentUser() {
        const authLink = findAuthLink();

        /*
         * Stop if the current page does not contain the shared
         * authentication navigation link.
         */
        if (!authLink) {
            return;
        }

        const container = authLink.closest('li');

        if (!container) {
            return;
        }

        const token = window.localStorage.getItem(TOKEN_KEY);

        /*
         * Keep the normal Sign Up / Login link when no token exists.
         */
        if (!token) {
            showLoggedOutNavigation(container);
            return;
        }

        try {
            const response = await window.fetch('/api/auth/me', {
                method: 'GET',
                headers: {
                    Authorization: 'Bearer ' + token,
                    Accept: 'application/json',
                },
            });

            /*
             * A 401 or 403 response means the stored token is no longer
             * valid or the user is not authorized.
             */
            if (response.status === 401 || response.status === 403) {
                window.localStorage.removeItem(TOKEN_KEY);
                showLoggedOutNavigation(container);
                return;
            }

            /*
             * Do not delete the token for temporary backend errors.
             */
            if (!response.ok) {
                throw new Error(
                    'Unable to retrieve the authenticated user. Status: ' +
                    response.status
                );
            }

            const user = await response.json();

            /*
             * The /api/auth/me endpoint should return at least a name
             * or email address.
             */
            const hasValidName =
                user &&
                typeof user.name === 'string' &&
                Boolean(user.name.trim());

            const hasValidEmail =
                user &&
                typeof user.email === 'string' &&
                Boolean(user.email.trim());

            if (!hasValidName && !hasValidEmail) {
                console.error(
                    'The authenticated user response does not contain a valid name or email.'
                );
                showLoggedOutNavigation(container);
                return;
            }

            showLoggedInNavigation(container, user);
        } catch (error) {
            /*
             * A temporary network or backend failure should not remove
             * a potentially valid token. The normal login link remains
             * available until the user can be verified.
             */
            console.error('Unable to load the current user:', error);
            showLoggedOutNavigation(container);
        }
    }

    /*
     * The script is loaded with the defer attribute, so the HTML has
     * normally been parsed before this function runs. The readyState
     * check also keeps it safe if defer is accidentally omitted.
     */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadCurrentUser);
    } else {
        loadCurrentUser();
    }
})();