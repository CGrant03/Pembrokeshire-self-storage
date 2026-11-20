/* Optional Google Ads measurement for Pembrokeshire Self Storage.
   No advertising tag is loaded unless the visitor explicitly accepts. */
(function () {
  'use strict';
  const consentKey = 'pss-google-ads-consent-v1';
  const tagId = 'AW-820349880';
  const conversionSendTo = 'AW-820349880/WJEtCNG8s7wdELiXlocD';
  let choice = null;
  let tagStarted = false;
  try {
    const saved = window.localStorage.getItem(consentKey);
    if (saved === 'accept' || saved === 'reject') choice = saved;
  } catch (_) { /* Storage can be disabled; consent is then session-only. */ }

  function startGoogleTag() {
    if (tagStarted || choice !== 'accept') return;
    tagStarted = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', tagId);
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(tagId);
    document.head.appendChild(script);
  }

  function clearGoogleAdCookies() {
    const names = document.cookie.split(';').map((part) => part.trim().split('=')[0]);
    for (const name of names) {
      if (!/^(_gcl_|_ga($|_)|_gid$)/.test(name)) continue;
      document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
      document.cookie = name + '=; Max-Age=0; path=/; domain=' + location.hostname + '; SameSite=Lax';
    }
  }

  function showBar() {
    const bar = document.getElementById('storageCookieBar');
    if (bar) bar.hidden = false;
  }

  function hideBar() {
    const bar = document.getElementById('storageCookieBar');
    if (bar) bar.hidden = true;
  }

  function choose(value) {
    const wasTracking = tagStarted;
    choice = value;
    try { window.localStorage.setItem(consentKey, value); } catch (_) { /* Session choice remains. */ }
    hideBar();
    if (value === 'accept') {
      startGoogleTag();
    } else if (wasTracking) {
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
          ad_storage: 'denied', ad_user_data: 'denied',
          ad_personalization: 'denied', analytics_storage: 'denied'
        });
      }
      clearGoogleAdCookies();
      location.reload(); // Stop the already-loaded optional tag after withdrawal.
    }
  }

  // Called only after Supabase confirms that a new enquiry was saved.
  window.storageAdsTrackEnquiry = function () {
    if (choice !== 'accept') return;
    startGoogleTag();
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'conversion', { send_to: conversionSendTo });
    }
  };

  function openCookieDetails(event) {
    const modal = document.getElementById('cookiesModal');
    if (modal) {
      event.preventDefault();
      if (typeof window.openModal === 'function') window.openModal('cookiesModal');
      else modal.style.display = 'block';
    }
  }

  function init() {
    const bar = document.createElement('section');
    bar.id = 'storageCookieBar';
    bar.className = 'storage-cookie-bar';
    bar.hidden = true;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Optional cookie choices');
    bar.innerHTML = '<div class="storage-cookie-message">Optional Google Ads cookies help us understand which ads bring enquiries. You can still send an enquiry if you decline. <a href="/?cookie-info=1" id="storageCookieDetails">Details</a></div>' +
      '<div class="storage-cookie-actions"><button type="button" id="storageCookieAccept">Accept</button><button type="button" id="storageCookieReject">Reject</button></div>';
    document.body.appendChild(bar);

    document.getElementById('storageCookieAccept').addEventListener('click', () => choose('accept'));
    document.getElementById('storageCookieReject').addEventListener('click', () => choose('reject'));
    document.getElementById('storageCookieDetails').addEventListener('click', openCookieDetails);

    const footer = document.querySelector('footer');
    if (footer) {
      const settings = document.createElement('button');
      settings.type = 'button';
      settings.className = 'storage-cookie-settings';
      settings.textContent = 'Cookie choices';
      settings.addEventListener('click', showBar);
      footer.appendChild(settings);
    }

    const cookiesModal = document.getElementById('cookiesModal');
    if (cookiesModal) {
      const change = document.createElement('button');
      change.type = 'button';
      change.className = 'storage-cookie-settings';
      change.textContent = 'Change cookie choice';
      change.addEventListener('click', () => {
        if (typeof window.closeModal === 'function') window.closeModal('cookiesModal');
        else cookiesModal.style.display = 'none';
        showBar();
      });
      cookiesModal.querySelector('.modalbox').appendChild(change);
      if (new URLSearchParams(location.search).has('cookie-info')) {
        if (typeof window.openModal === 'function') window.openModal('cookiesModal');
        else cookiesModal.style.display = 'block';
      }
    }

    if (choice === 'accept') startGoogleTag();
    else if (choice !== 'reject') showBar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
