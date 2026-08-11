(function () {
    'use strict';

    const page = document.querySelector('.faq-page');

    if (!page) {
        return;
    }

    const elements = {
        searchInput: document.getElementById('faq-search-input'),
        clearButton: document.getElementById('faq-search-clear'),
        searchStatus: document.getElementById('faq-search-status'),
        emptyState: document.getElementById('faq-empty-state'),
        categoryNavigation: document.querySelector('.faq-categories'),
        categoryLinks: Array.from(document.querySelectorAll('[data-faq-category]')),
        sections: Array.from(document.querySelectorAll('[data-faq-section]')),
        items: Array.from(document.querySelectorAll('[data-faq-item]')),
        questionButtons: Array.from(document.querySelectorAll('.faq-question')),
    };

    if (
        !elements.searchInput ||
        !elements.clearButton ||
        !elements.searchStatus ||
        !elements.emptyState ||
        !elements.categoryNavigation ||
        elements.categoryLinks.length === 0 ||
        elements.sections.length === 0 ||
        elements.items.length === 0 ||
        elements.questionButtons.length === 0
    ) {
        return;
    }

    let selectedCategory = getInitialCategory();

    function getInitialCategory() {
        const hash = window.location.hash;
        const linkedSection = elements.sections.find(function (section) {
            return '#' + section.id === hash;
        });

        return linkedSection ? linkedSection.dataset.faqSection : elements.sections[0].dataset.faqSection;
    }

    function getSection(category) {
        return elements.sections.find(function (section) {
            return section.dataset.faqSection === category;
        });
    }

    function getCategoryName(category) {
        const section = getSection(category);
        const heading = section ? section.querySelector('.faq-section__header h2') : null;

        return heading ? heading.textContent.trim() : 'the selected category';
    }

    function initializeFaqAccordions() {
        elements.questionButtons.forEach(function (button) {
            const answerId = button.getAttribute('aria-controls');
            const answer = answerId ? document.getElementById(answerId) : null;

            if (!answer) {
                return;
            }

            button.setAttribute('aria-expanded', 'false');
            answer.hidden = true;
        });
    }

    function toggleFaqItem(button) {
        const answerId = button.getAttribute('aria-controls');
        const answer = answerId ? document.getElementById(answerId) : null;

        if (!answer) {
            return;
        }

        const willExpand = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(willExpand));
        answer.hidden = !willExpand;
    }

    function setActiveCategory(category) {
        elements.categoryLinks.forEach(function (link) {
            const isActive = link.dataset.faqCategory === category;
            const state = link.querySelector('[data-category-state]');

            if (isActive) {
                link.setAttribute('aria-current', 'location');
            } else {
                link.removeAttribute('aria-current');
            }

            if (state) {
                state.hidden = !isActive;
            }
        });
    }

    function showSelectedCategory() {
        elements.sections.forEach(function (section) {
            section.hidden = section.dataset.faqSection !== selectedCategory;
        });
    }

    function showAllFaqItems() {
        elements.items.forEach(function (item) {
            item.hidden = false;
        });
    }

    function selectFaqCategory(category) {
        if (!getSection(category)) {
            return;
        }

        selectedCategory = category;
        page.classList.remove('is-searching');
        showAllFaqItems();
        showSelectedCategory();
        setActiveCategory(selectedCategory);
        elements.emptyState.hidden = true;
        updateSearchStatus(getSection(category).querySelectorAll('[data-faq-item]').length, '');
    }

    function normalizeSearchText(value) {
        return value.trim().toLocaleLowerCase();
    }

    function filterFaqItems(query) {
        const normalizedQuery = normalizeSearchText(query);

        if (!normalizedQuery) {
            resetFaqView();
            return;
        }

        let matchCount = 0;
        page.classList.add('is-searching');
        setActiveCategory(null);

        elements.sections.forEach(function (section) {
            let sectionMatchCount = 0;
            const sectionItems = Array.from(section.querySelectorAll('[data-faq-item]'));

            sectionItems.forEach(function (item) {
                const isMatch = normalizeSearchText(item.textContent).includes(normalizedQuery);
                item.hidden = !isMatch;

                if (isMatch) {
                    matchCount += 1;
                    sectionMatchCount += 1;
                }
            });

            section.hidden = sectionMatchCount === 0;
        });

        elements.emptyState.hidden = matchCount !== 0;
        elements.clearButton.disabled = false;
        updateSearchStatus(matchCount, query.trim());
    }

    function updateSearchStatus(count, query) {
        if (query) {
            const questionLabel = count === 1 ? 'question matches' : 'questions match';
            elements.searchStatus.textContent = count + ' ' + questionLabel + ' "' + query + '" across all categories.';
            return;
        }

        const questionLabel = count === 1 ? 'question' : 'questions';
        elements.searchStatus.textContent = 'Showing ' + count + ' ' + questionLabel + ' in ' + getCategoryName(selectedCategory) + '.';
    }

    function clearFaqSearch(options) {
        const settings = options || {};
        elements.searchInput.value = '';
        resetFaqView();

        if (settings.focus !== false) {
            elements.searchInput.focus();
        }
    }

    function resetFaqView() {
        page.classList.remove('is-searching');
        showAllFaqItems();
        showSelectedCategory();
        setActiveCategory(selectedCategory);
        elements.emptyState.hidden = true;
        elements.clearButton.disabled = elements.searchInput.value.length === 0;

        const section = getSection(selectedCategory);
        const itemCount = section ? section.querySelectorAll('[data-faq-item]').length : 0;
        updateSearchStatus(itemCount, '');
    }

    function handleCategoryKeydown(event) {
        const currentLink = event.target.closest('[data-faq-category]');

        if (!currentLink) {
            return;
        }

        const currentIndex = elements.categoryLinks.indexOf(currentLink);
        let nextIndex = currentIndex;

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            nextIndex = (currentIndex + 1) % elements.categoryLinks.length;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            nextIndex = (currentIndex - 1 + elements.categoryLinks.length) % elements.categoryLinks.length;
        } else if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = elements.categoryLinks.length - 1;
        } else {
            return;
        }

        event.preventDefault();
        elements.categoryLinks[nextIndex].focus();
    }

    page.addEventListener('click', function (event) {
        const questionButton = event.target.closest('.faq-question');

        if (questionButton && page.contains(questionButton)) {
            toggleFaqItem(questionButton);
        }
    });

    elements.categoryLinks.forEach(function (link) {
        link.addEventListener('click', function (event) {
            event.preventDefault();
            clearFaqSearch({ focus: false });
            selectFaqCategory(link.dataset.faqCategory);
        });
    });

    elements.categoryNavigation.addEventListener('keydown', handleCategoryKeydown);

    elements.searchInput.addEventListener('input', function () {
        elements.clearButton.disabled = elements.searchInput.value.length === 0;
        filterFaqItems(elements.searchInput.value);
    });

    elements.searchInput.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && elements.searchInput.value) {
            event.preventDefault();
            clearFaqSearch();
        }
    });

    elements.clearButton.addEventListener('click', function () {
        clearFaqSearch();
    });

    initializeFaqAccordions();
    page.classList.add('faq-page--enhanced');
    resetFaqView();
})();
