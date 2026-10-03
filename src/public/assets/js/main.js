/**
* Abdullah Portfolio - front-end behaviour.
*
* Everything here is progressive enhancement: the site works without it.
* Modules:
*   1. html class swap (no-js -> js)
*   2. sticky header state
*   3. mobile drawer
*   4. accordion
*   5. reveal on scroll
*   6. inquiry form UX
*   7. smooth in-page scrolling
*/
(function () {
	'use strict';

	var doc = document;
	var root = doc.documentElement;
	var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	/* ------------------------------------------------------------------ */
	/* 1. JS flag - enables .js-only styles such as reveal animations.      */
	/* ------------------------------------------------------------------ */
	root.classList.remove('no-js');
	root.classList.add('js');

	/* ------------------------------------------------------------------ */
	/* 2. Header shadow once the page is scrolled.                          */
	/* ------------------------------------------------------------------ */
	var header = doc.querySelector('[data-header]');
	if (header) {
		var onScroll = function () {
			header.classList.toggle('is-scrolled', window.scrollY > 8);
		};
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
	}

	/* ------------------------------------------------------------------ */
	/* 3. Mobile drawer.                                                   */
	/* ------------------------------------------------------------------ */
	(function initDrawer() {
		var toggle = doc.querySelector('[data-nav-toggle]');
		var drawer = doc.querySelector('[data-drawer]');

		if (!toggle || !drawer) {
			return;
		}

		var config = window.abdConfig || {};
		var lastFocused = null;

		var focusables = function () {
			return Array.prototype.slice.call(
			drawer.querySelectorAll('a[href], button:not([disabled]), input, select, textarea')
			);
		};

		var open = function () {
			lastFocused = doc.activeElement;
			drawer.hidden = false;
			// Next frame so the transition has a starting point.
			window.requestAnimationFrame(function () {
				drawer.classList.add('is-open');
			});
			toggle.setAttribute('aria-expanded', 'true');
			doc.body.style.overflow = 'hidden';
			var label = toggle.querySelector('.screen-reader-text');
			if (label && config.menuCloseLabel) {
				label.textContent = config.menuCloseLabel;
			}
			var first = focusables()[0];
			if (first) {
				first.focus();
			}
		};

		var close = function () {
			drawer.classList.remove('is-open');
			toggle.setAttribute('aria-expanded', 'false');
			doc.body.style.overflow = '';
			var label = toggle.querySelector('.screen-reader-text');
			if (label && config.menuOpenLabel) {
				label.textContent = config.menuOpenLabel;
			}
			var finish = function () {
				drawer.hidden = true;
			};
			if (reduceMotion) {
				finish();
			} else {
				window.setTimeout(finish, 320);
			}
			if (lastFocused && typeof lastFocused.focus === 'function') {
				lastFocused.focus();
			}
		};

		var isOpen = function () {
			return toggle.getAttribute('aria-expanded') === 'true';
		};

		toggle.addEventListener('click', function () {
			if (isOpen()) {
				close();
			} else {
				open();
			}
		});

		var closeBtn = drawer.querySelector('[data-drawer-close]');
		if (closeBtn) {
			closeBtn.addEventListener('click', close);
		}

		Array.prototype.forEach.call(drawer.querySelectorAll('a[href]'), function (link) {
			link.addEventListener('click', close);
		});

		// Clicking the backdrop (the element itself, not the panel) closes.
		drawer.addEventListener('click', function (event) {
			if (event.target === drawer) {
				close();
			}
		});

		doc.addEventListener('keydown', function (event) {
			if (!isOpen()) {
				return;
			}

			if (event.key === 'Escape') {
				close();
				return;
			}

			// Minimal focus trap.
			if (event.key === 'Tab') {
				var items = focusables();
				if (!items.length) {
					return;
				}
				var first = items[0];
				var last = items[items.length - 1];
				if (event.shiftKey && doc.activeElement === first) {
					event.preventDefault();
					last.focus();
				} else if (!event.shiftKey && doc.activeElement === last) {
					event.preventDefault();
					first.focus();
				}
			}
		});

		// Closing on resize past the desktop breakpoint keeps state consistent.
		var desktop = window.matchMedia('(min-width: 900px)');
		var onChange = function (event) {
			if (event.matches && isOpen()) {
				close();
			}
		};
		if (typeof desktop.addEventListener === 'function') {
			desktop.addEventListener('change', onChange);
		} else if (typeof desktop.addListener === 'function') {
			desktop.addListener(onChange);
		}
	}());

	/* ------------------------------------------------------------------ */
	/* 4. Accordion.                                                       */
	/* ------------------------------------------------------------------ */
	(function initAccordions() {
		var groups = doc.querySelectorAll('[data-accordion]');

		Array.prototype.forEach.call(groups, function (group) {
			var items = group.querySelectorAll('[data-accordion-item]');

			Array.prototype.forEach.call(items, function (item) {
				var trigger = item.querySelector('[data-accordion-trigger]');
				if (!trigger) {
					return;
				}

				trigger.addEventListener('click', function () {
					var willOpen = !item.classList.contains('is-open');

					// One panel open at a time inside a group.
					Array.prototype.forEach.call(items, function (other) {
						other.classList.remove('is-open');
						var otherTrigger = other.querySelector('[data-accordion-trigger]');
						if (otherTrigger) {
							otherTrigger.setAttribute('aria-expanded', 'false');
						}
					});

					if (willOpen) {
						item.classList.add('is-open');
						trigger.setAttribute('aria-expanded', 'true');
					}
				});
			});
		});
	}());

	/* ------------------------------------------------------------------ */
	/* 5. Reveal on scroll.                                                */
	/* ------------------------------------------------------------------ */
	(function initReveal() {
		var targets = doc.querySelectorAll('[data-reveal]');

		if (!targets.length) {
			return;
		}

		if (reduceMotion || !('IntersectionObserver' in window)) {
			Array.prototype.forEach.call(targets, function (el) {
				el.classList.add('is-visible');
			});
			return;
		}

		var observer = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				if (entry.isIntersecting) {
					entry.target.classList.add('is-visible');
					observer.unobserve(entry.target);
				}
			});
		}, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

		Array.prototype.forEach.call(targets, function (el) {
			observer.observe(el);
		});
	}());

	/* ------------------------------------------------------------------ */
	/* 6. Inquiry form UX.                                                 */
	/* ------------------------------------------------------------------ */
	(function initInquiryForm() {
		var form = doc.querySelector('[data-inquiry-form]');
		if (!form) {
			return;
		}

		var submit = form.querySelector('[data-inquiry-submit]');

		// Show a loading state while the browser posts (PRG keeps the result
		// cache-safe, so this is deliberately not an AJAX submission).
		form.addEventListener('submit', function (event) {
			if (form.checkValidity && !form.checkValidity()) {
				return; // Let the browser report the invalid fields.
			}

			if (submit) {
				submit.classList.add('is-loading');
				submit.setAttribute('aria-disabled', 'true');
			}
		});

		// Clear a field's invalid state as soon as the visitor edits it.
		Array.prototype.forEach.call(form.elements, function (field) {
			if (!field.name) {
				return;
			}
			field.addEventListener('input', function () {
				field.removeAttribute('aria-invalid');
				var error = form.querySelector('#' + field.id + '_error');
				if (error) {
					error.remove();
				}
				if (submit) {
					submit.classList.remove('is-loading');
					submit.removeAttribute('aria-disabled');
				}
			});
		});

		// Focus the first invalid field after a server round-trip.
		var firstInvalid = form.querySelector('[aria-invalid="true"]');
		if (firstInvalid) {
			firstInvalid.focus({ preventScroll: false });
		}
	}());

	/* ------------------------------------------------------------------ */
	/* 7. Smooth scrolling for same-page anchors.                          */
	/* ------------------------------------------------------------------ */
	(function initSmoothScroll() {
		doc.addEventListener('click', function (event) {
			var link = event.target && event.target.closest ? event.target.closest('a[href^="#"]') : null;
			if (!link) {
				return;
			}

			var hash = link.getAttribute('href');
			if (!hash || hash.length < 2) {
				return;
			}

			var target = doc.getElementById(hash.slice(1));
			if (!target) {
				return;
			}

			event.preventDefault();
			target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
			if (history.pushState) {
				history.pushState(null, '', hash);
			}
		});
	}());
}());