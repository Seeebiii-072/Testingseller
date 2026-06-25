/* JS for preset "Menu V2" */
(function() {
	$(function() {
		$('.menu-wrapper:visible').each(function() {
			initMenu($(this))
		});
	});

	// Make :active pseudo classes work on iOS
	document.addEventListener("touchstart", function() {}, false);

	const initMenu = function($menuWrapper) {
		const $body = $('body');
		const $menu = $('.ed-menu', $menuWrapper);
		const $menuLinks = $('a', $menu);
		const $menuTrigger = $('.menu-trigger', $menuWrapper);
		const $banner = $('.banner').first();

		const smoothScrollOffset = 20;
		
		// Set aria attributes
		$menuTrigger.attr({
				'aria-expanded': 'false',
				'aria-controls': $menu.attr('id'),
		});

		toggleClassOnClick($body.add($menu), $menuTrigger, null, 'open open-menu'); // Keep open on $menu for backward compatibility
		activateSmoothScroll($menuLinks.add($('.scroll a')), smoothScrollOffset);
		addClassOnVisibleLinkTargets($menuLinks, 'active', 2 / 3);
		handleSticky($menuWrapper, 'sticky', $banner);
	};

	/**
	 * Observe element's height changes and reload the initMenu() function
	 *
	 * @param {HTMLElement} elm Element to observe
	 * @param {function} callback to call when elmement's height changed
	 */
	const observeHeightChange = function(elm, callback) {
		if (!('ResizeObserver' in window) || elm == null) return;

		const ro = new ResizeObserver(callback);
		ro.observe(elm);
	}

	/**
	 * Toggles class on a target when a trigger is clicked
	 * 
	 * @param {jQuery} $target The target to apply the CSS class to
	 * @param {jQuery} $trigger The Trigger
	 * @param {jQuery} $closeTrigger Optional close trigger
	 * @param {string} cssClass CSS Class to toggle on the target
	 */
	const toggleClassOnClick = function($target, $trigger, $closeTrigger, cssClass) {

		// Reset in case class "open" was saved accidentally
		$target.removeClass(cssClass);
		$trigger.removeClass(cssClass).attr('aria-expanded', 'false');

		// Click on trigger toggles class "open"
		$trigger.off('.toggle').on('click.toggle', function() {
			const isExpanded = $(this).attr('aria-expanded') === 'true';
			const $menu = $target.filter('.ed-menu');
			$(this).toggleClass(cssClass).attr('aria-expanded', !isExpanded);
			$target.toggleClass(cssClass);

			// Set focus to menu on open
			if (!isExpanded) {
				$menu.attr('tabindex', '0');
				const focusMenu = () => {
					$menu.focus();
					$menu.off('transitionend', focusMenu);
				};
				$menu.on('transitionend', focusMenu);
			}

			$menu[0].addEventListener(
				'blur',
				function() {
					$menu[0].removeAttribute('tabindex');
				}, {
					once: true
				}
			);
		});

		// Close target when link inside is clicked
		$target.find('a').click(function() {
			$target.removeClass(cssClass);
			$trigger.removeClass(cssClass).attr('aria-expanded', 'false');
		});

		if (!$closeTrigger || !$closeTrigger.length) {
			return;
		}

		$closeTrigger.click(function() {
			$target.removeClass(cssClass);
			$trigger.removeClass(cssClass).attr('aria-expanded', 'false');
		});
	};

	/**
	 * Smooth scroll to link targets
	 * 
	 * @param {jQuery} $scrollLinks The links
	 * @param {jQuery} scrollOffset Offset to subtract from the scroll target position (e.g. for fixed positioned elements like a menu)
	 */
	const activateSmoothScroll = function($scrollLinks, scrollOffset) {
		if (typeof scrollOffset === 'undefined') {
			scrollOffset = 0;
		}

		const determineTarget = function($trigger, hash) {
			if (hash == '#!next') {
				return $trigger.closest('.ed-element').next();
			}
			// Prevent invalid selectors
			try {
				return $(hash);
			} catch (e) {
				return $();
			}
		}

		$scrollLinks.click(function(e) {
			const $target = determineTarget($(this), this.hash);
			if (!$target.length) return;
			e.preventDefault();

			viewport.scrollTo($target, 'top', 500, 0);

		});
	};

	/**
	 * We are using the fill property on an element to pass user's choices from CSS to JavaScript
	 * 
	 * @param {jQuery} $element
	 */
	const getStickyMode = function($element) {
		const fillValue = getComputedStyle($element[0]).fill;

		return fillValue === 'rgb(255, 0, 0)' ?
			'sticky_banner' :
			fillValue === 'rgb(0, 255, 0)' ?
			'sticky_menu' :
			fillValue === 'rgb(0, 0, 255)' ?
			'sticky_instant' :
			fillValue === 'rgb(255, 255, 255)' ?
			'sticky_reverse' :
			'sticky_none';
	};

	/**
	 * Adds a class to an element when not currently visible
	 * 
	 * @param {jQuery} $element The element to handle stickyness for
	 * @param {string} cssClass The actual CSS class to be applied to the element when it's above a certain scroll position
	 * @param {jQuery} $banner A banner to reference the scroll position to
	 */
	const handleSticky = function($element, cssClass, $banner) {
		let triggerPos = 0,
			offset = 0;
		let menuWrapperHeight = $element.outerHeight();
		let mode;
		let prevScroll = 0;
		$element.removeClass(cssClass);
		
		const toggleSpacer = function(toggle) {
			document.body.style.setProperty('--spacer-height', toggle ? menuWrapperHeight + 'px' : '');
		};

		const handleScroll = function() {
			if (!$element.length || mode === 'sticky_none') return;
			//if (!$element.length || mode === 'sticky_none' || mode === 'sticky_instant') return;

			const isReverse = mode === 'sticky_reverse',
				curScroll = viewport.getScrollTop();

			if (triggerPos <= curScroll && (!isReverse || prevScroll > curScroll)) {
				$element.addClass(cssClass);
				toggleSpacer(true);
			} else {
				$element.removeClass(cssClass);
				toggleSpacer(false);
			}

			prevScroll = curScroll;
		};
		
		const updateOffset = function() {
			mode = getStickyMode($element);
			menuWrapperHeight = $element.outerHeight();
			if (!$element.hasClass(cssClass)) {
				offset = $element.offset().top;
			}
			if (mode === 'sticky_banner' && !$banner.length) {
				mode = 'sticky_menu';
			}
			if (mode === 'sticky_banner') {
				triggerPos = $banner.offset().top + ($banner.length ? $banner.outerHeight() : $element.outerHeight());
			}
			if (mode === 'sticky_menu' || mode === 'sticky_reverse') {
				triggerPos = offset + $element.outerHeight();
			}
			if (mode === 'sticky_instant') {
				triggerPos = offset;
			}
			
			handleScroll();
		}
		
		viewport.observe('resize', updateOffset);
		viewport.observe('animation.end', updateOffset);
		observeHeightChange($element[0], updateOffset);
		updateOffset();
		
		viewport.observe('scroll', handleScroll);
		handleScroll();
	};

	/**
	 * Adds a class to links whose target is currently inside the viewport
	 * 
	 * @param {jQuery} $links Link(s) to be observed
	 * @param {string} cssClass CSS Class to be applied
	 * @param {float} sectionViewportRatio Ratio by which the target should be within the viewport
	 */
	const addClassOnVisibleLinkTargets = function($links, cssClass, sectionViewportRatio) {
		if (typeof sectionViewportRatio === 'undefined') {
			sectionViewportRatio = 1 / 2;
		}

		const menuTargets = [];
		const activeLink = $links.filter('.active');

		const links = $links.filter(function() {
			// Prevent invalid selectors
			let $target;
			try {
				$target = $(this.hash);
			} catch (e) {
				return false;
			}
			if (!this.hash || !$target.length) {
				return false;
			}

			// Cache offset position to improve performance (update on resize)		
			const updateOffset = function() {
				$target.data('offset', $target.offset().top);
			};

			viewport.observe('resize', updateOffset);
			viewport.observe('animation.end', updateOffset);
			updateOffset();

			menuTargets.push($target);
			return true;
		});

		// No hash links found, so don't handle it at all
		if (!links.length) {
			return;
		}

		const checkVisibility = function() {
			$links.removeClass('active');

			// Check section position reversely
			for (let i = menuTargets.length - 1; i >= 0; i--) {
				const desiredScrollPosition = menuTargets[i].data('offset') - viewport.getHeight() * (1 - sectionViewportRatio);
				if (viewport.getScrollTop() >= desiredScrollPosition && menuTargets[i][0].offsetParent !== null) {
					links.eq(i).addClass(cssClass);
					return;
				}
			}

			// Fallback to originally active item
			activeLink.addClass(cssClass);
		};

		viewport.observe('scroll', checkVisibility);
		checkVisibility();
	};
})();
/* End JS for preset "Menu V2" */

/* JS for preset "Counter V2" */
$(function() {
	EasingFunctions = {
		// no easing, no acceleration
		linear: function(t) {
			return t
		},
		// accelerating from zero velocity
		easeInQuad: function(t) {
			return t * t
		},
		// decelerating to zero velocity
		easeOutQuad: function(t) {
			return t * (2 - t)
		},
		// acceleration until halfway, then deceleration
		easeInOutQuad: function(t) {
			return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t
		},
		// accelerating from zero velocity 
		easeInCubic: function(t) {
			return t * t * t
		},
		// decelerating to zero velocity 
		easeOutCubic: function(t) {
			return (--t) * t * t + 1
		},
		// acceleration until halfway, then deceleration 
		easeInOutCubic: function(t) {
			return t < .5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
		},
		// accelerating from zero velocity 
		easeInQuart: function(t) {
			return t * t * t * t
		},
		// decelerating to zero velocity 
		easeOutQuart: function(t) {
			return 1 - (--t) * t * t * t
		},
		// acceleration until halfway, then deceleration
		easeInOutQuart: function(t) {
			return t < .5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t
		},
		// accelerating from zero velocity
		easeInQuint: function(t) {
			return t * t * t * t * t
		},
		// decelerating to zero velocity
		easeOutQuint: function(t) {
			return 1 + (--t) * t * t * t * t
		},
		// acceleration until halfway, then deceleration 
		easeInOutQuint: function(t) {
			return t < .5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t
		}
	}
    
	$('[data-count]').each(function() {
		var $target = $(this);
		var offset = 0;
		
		var duration = 2000;
		var interval = Math.floor(duration / 60);
		var steps = Math.ceil(duration / interval);
		var max = $target.data('count');
		
		var run = false, handle;
		
		// Cache offset position to improve performance (update on resize)		
		var updateOffset = function() {
			offset = $target.offset().top + $target.height()/2;
		};
		viewport.observe('resize', updateOffset);
		viewport.observe('animation.end', updateOffset);
		updateOffset();
		
		var resetCounter = function() {
		    $target.html('0');
		    run = false;
		};
		
		var finishCounter = function() {
		    $target.html(max);
			window.clearInterval(handle);
		};

		var startCounter = function() {
			if (run) return;

			run = true;
			var i = 0;
			handle = window.setInterval(function() {
                var newCount = Math.round(max * EasingFunctions.easeOutCubic(++i / steps));
                if (newCount >= max) {
                    return finishCounter();
                }
				$target.html(newCount);
			}, interval);
		};
		
		var checkVisiblity = function() {
		    var t = viewport.getScrollTop();
		    var h = viewport.getHeight();
		    if (t < offset && offset < t+h) {
				!run && startCounter();
			} else {
			    run && resetCounter();
			}
		};
		
		viewport.observe('scroll', checkVisiblity);
		checkVisiblity();
	});
});
/* End JS for preset "Counter V2" */

/* JS for preset "Marquee V2" */
$(function() {
   $('.marquee-wrap').attr('data-items', $('.marquee-wrap > .inner').children().length);
});
/* End JS for preset "Marquee V2" */

// will be added to the custom JS before the creation process and removed after it
if (!document.querySelector('.sj-generator-script')) {
  const createWebsiteScript = (config = {}) => {
    const {allowedOrigins = ['https://ai.sitehub.io'], isDevelopment = false} = config;
    let scrollIntervalId;
    const HIDE_ELEMENTS_CLASSNAMES = ['hide-sm', 'hide-md', 'hide-lg'];
    const SKELETON_CLASSNAME = 'pulse-effect';

    let hoverListenersReady = false;

    function addHoverListeners() {
      // Find all sections using the DOM structure: body > .ed-element > .inner
      const sectionElements = document.querySelectorAll('body > .ed-element > .inner');

      sectionElements.forEach(innerElement => {
        const containerId = innerElement.id;
        if (!containerId) return;

        innerElement.removeEventListener('mouseover', innerElement._hoverEnterHandler);
        innerElement.removeEventListener('mousemove', innerElement._hoverEnterHandler);
        innerElement.removeEventListener('wheel', innerElement._hoverEnterHandler);
        innerElement.removeEventListener('mouseout', innerElement._hoverLeaveHandler);

        innerElement.style.pointerEvents = 'auto';

        innerElement._hoverEnterHandler = function (e) {
          if (!hoverListenersReady) return;
          const bounds = innerElement.getBoundingClientRect();
          if (bounds.width === 0 || bounds.height === 0) return;
          window.parent.postMessage(
            {
              type: 'sectionHover',
              sectionId: containerId,
              bounds: {
                top: bounds.top,
                right: bounds.right,
                bottom: bounds.bottom,
                left: bounds.left,
                width: bounds.width,
                height: bounds.height,
              },
            },
            allowedOrigins[0]
          );
        };

        innerElement._hoverLeaveHandler = function (e) {
          if (!hoverListenersReady) return;

          const relatedTarget = e.relatedTarget;

          if (relatedTarget && innerElement.contains(relatedTarget)) {
            return;
          }

          if (!relatedTarget || !document.contains(relatedTarget)) {
            setTimeout(() => {
              window.parent.postMessage(
                {type: 'sectionHoverEnd', sectionId: containerId},
                allowedOrigins[0]
              );
            }, 150);
            return;
          }

          window.parent.postMessage(
            {type: 'sectionHoverEnd', sectionId: containerId},
            allowedOrigins[0]
          );
        };

        innerElement.addEventListener('mouseover', innerElement._hoverEnterHandler);
        innerElement.addEventListener('mousemove', innerElement._hoverEnterHandler);
        innerElement.addEventListener('wheel', innerElement._hoverEnterHandler);
        innerElement.addEventListener('mouseout', innerElement._hoverLeaveHandler);
      });

      setTimeout(() => {
        hoverListenersReady = true;
      }, 2000);
    }

    function scrollThroughChildren(interval = 2000) {
      if (document.body.classList.contains('edit')) return;
      if (scrollIntervalId) {
        clearInterval(scrollIntervalId);
        scrollIntervalId = null;
      }
      const bodyChildren = Array.from(document.body.children).filter(
        child =>
          child.id.startsWith('ed-') &&
          !HIDE_ELEMENTS_CLASSNAMES.some(cls => child.classList.contains(cls))
      );
      let currentIndex = 0;

      if (window.location.hash) {
        const startElement = document.getElementById(window.location.hash.substring(1));
        const startIndex = bodyChildren.indexOf(startElement);
        if (startIndex !== -1) currentIndex = startIndex;
      }
      function scroll() {
        const element = bodyChildren[currentIndex];
        element.scrollIntoView({block: 'center', behavior: 'smooth'});
        currentIndex = (currentIndex + 1) % bodyChildren.length;
        window.parent.postMessage({type: 'scrollTarget', id: element.id}, allowedOrigins[0]);
      }

      scrollIntervalId = setInterval(scroll, interval);
    }

    function hideElement(element) {
      element.classList.add(...HIDE_ELEMENTS_CLASSNAMES);
    }

    function showElement(element) {
      element.classList.remove(...HIDE_ELEMENTS_CLASSNAMES);
    }

    function hideElementSkeleton(element) {
      element.classList.remove(SKELETON_CLASSNAME);
    }

    function showElementSkeleton(element) {
      element.classList.add(SKELETON_CLASSNAME);
    }

    function scrollToWithOffset(element) {
      function getTargetElement(element) {
        return element.closest('body > .ed-element') ?? element;
      }

      function getActiveMenuWrapperOffset() {
        const activeMenuWrapper = document.querySelector(
          'body > .ed-element:not(.hide-lg) .menu-wrapper.sticky'
        );
        return activeMenuWrapper ? activeMenuWrapper.offsetHeight : 0;
      }

      const targetElement = getTargetElement(element);
      const menuOffset = getActiveMenuWrapperOffset();
      const top = targetElement.getBoundingClientRect().top + window.scrollY - menuOffset;

      function onScroll() {
        if (window.scrollY.toFixed() === top.toFixed()) {
          window.removeEventListener('scroll', onScroll);

          // check again when target position is reached and scroll again if needed
          const afterScrollOffset = getActiveMenuWrapperOffset();
          if (afterScrollOffset !== 0) {
            window.scrollTo({
              top: targetElement.getBoundingClientRect().top + window.scrollY - afterScrollOffset,
              behavior: 'smooth',
            });
          }
        }
      }

      // if no fixed menu at the moment, we need to listen to scroll to check again after we reach the position
      if (menuOffset === 0) {
        window.addEventListener('scroll', onScroll);
      }

      window.scrollTo({
        top,
        behavior: 'smooth',
      });
    }

    function handleMessage(event) {
      if (event.origin !== allowedOrigins[0]) return;
      const {data} = event;
      switch (data.type) {
        case 'requestBodyWithScroll':
          scrollThroughChildren();
          addHoverListeners();
          event.source.postMessage({type: 'body', html: document.body.innerHTML}, event.origin);
          break;
        case 'requestBodyForHover':
          addHoverListeners();
          event.source.postMessage({type: 'body', html: document.body.innerHTML}, event.origin);
          break;
        case 'requestBody':
          addHoverListeners();
          event.source.postMessage({type: 'body', html: document.body.innerHTML}, event.origin);
          break;
        case 'stopScroll':
          if (scrollIntervalId) {
            clearInterval(scrollIntervalId);
            scrollIntervalId = null;
          }
          break;
        case 'hideElements':
        case 'showElements':
          data.elementIds.forEach(id => {
            const element = document.getElementById(`ed-${id}`);
            if (element) data.type === 'hideElements' ? hideElement(element) : showElement(element);
          });
          if (data.type === 'showElements' && data.lastContainerId) {
            const lastElement = document.getElementById(data.lastContainerId);
            if (lastElement) scrollToWithOffset(lastElement);
          }
          break;
        case 'hideElementsSkeleton':
        case 'showElementsSkeleton':
          data.elementIds.forEach(id => {
            const element = document.getElementById(id);
            if (element)
              data.type === 'hideElementsSkeleton'
                ? hideElementSkeleton(element)
                : showElementSkeleton(element);
          });
          break;
        case 'scrollToElement':
          const element = document.getElementById(data.elementId);
          if (element) element.scrollIntoView({behavior: 'smooth', block: 'center'});
          break;
      }
    }
    return {
      init: () => window.addEventListener('message', handleMessage),
      cleanup: () => {
        window.removeEventListener('message', handleMessage);
        if (scrollIntervalId) clearInterval(scrollIntervalId);
      },
    };
  };

  const websiteScript = createWebsiteScript({allowedOrigins: ['https://ai.sitehub.io'], isDevelopment: false});
  websiteScript.init();
}