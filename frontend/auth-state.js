/*
 * Displays the authenticated user's name in the shared navigation.
 * Also provides a logout button and removes invalid/expired tokens.
 */

(function () {
    'use strict';

    const TOKEN_KEY = 'access_token';

    /**
     * Find the existing "Sign Up / Login" navigation link.
     */
    function findAuthLink() {
        return document.querySelector(
            '.primary-navigation a[href="auth.html"]'
        );
    }

    /**
     * Restore the default navigation when the user is not authenticated.
     */
    function showLoggedOutNavigation(container) {
        if (!container) {
            return;
        }

        container.replaceChildren();

        const authLink = document.createElement('a');
        authLink.className = 'nav-link nav-link--button';
        authLink.href = 'auth.html';
        authLink.textContent = 'Sign Up / Login';

        container.appendChild(authLink);
    }

    /**
     * Remove the stored JWT and restore the logged-out navigation.
     */
    function logout(container) {
        window.localStorage.removeItem(TOKEN_KEY);
        showLoggedOutNavigation(container);

        // Return to the home page after logging out.
        window.location.href = 'index.html';
    }

    /**
     * Replace the authentication link with the user's name and logout button.
     */
    function showLoggedInNavigation(container, user) {
        if (!container || !user) {
            return;
        }

        container.replaceChildren();
        container.classList.add('nav-account');

        const welcomeText = document.createElement('span');
        welcomeText.className = 'nav-account__welcome';

        // textContent prevents a user's name from being interpreted as HTML.
        welcomeText.textContent = 'Welcome, ' + user.name;

        const logoutButton = document.createElement('button');
        logoutButton.className = 'nav-account__logout';
        logoutButton.type = 'button';
        logoutButton.textContent = 'Logout';
        logoutButton.setAttribute(
            'aria-label',
            'Log out of the LegalSimple account'
        );

        logoutButton.addEventListener('click', function () {
            logout(container);
        });

        container.append(welcomeText, logoutButton);
    }

    /**
     * Retrieve the signed-in user's account using the stored JWT.
     */
    async function loadCurrentUser() {
        const authLink = findAuthLink();

        if (!authLink) {
            return;
        }

        const container = authLink.closest('li');
        const token = window.localStorage.getItem(TOKEN_KEY);

        if (!token) {
            showLoggedOutNavigation(container);
            return;
        }

        try {
            const response = await window.fetch('/api/auth/me', {
                method: 'GET',
                headers: {
                    Authorization: 'Bearer ' + token,
                },
            });

            if (!response.ok) {
                // A 401 normally means the token is invalid or expired.
                window.localStorage.removeItem(TOKEN_KEY);
                showLoggedOutNavigation(container);
                return;
            }

            const user = await response.json();

            if (!user || typeof user.name !== 'string' || !user.name.trim()) {
                window.localStorage.removeItem(TOKEN_KEY);
                showLoggedOutNavigation(container);
                return;
            }

            showLoggedInNavigation(container, user);
        } catch (error) {
            /*
             * Do not delete the token for a temporary network failure.
             * The user may still have a valid session.
             */
            console.error('Unable to load the current user:', error);
            showLoggedOutNavigation(container);
        }
    }

    document.addEventListener('DOMContentLoaded', loadCurrentUser);
})();