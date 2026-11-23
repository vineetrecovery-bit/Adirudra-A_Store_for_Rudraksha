// Sign in / create account with mobile number + password.
(function () {
  'use strict';
  const { api, Auth, $, $$ } = Store;

  const params = new URLSearchParams(location.search);
  // Where to go afterwards: the page that sent the visitor here, or their account / the admin panel.
  const destination = (user) => Auth.safeNext(params.get('next'), user.role === 'admin' ? 'admin.html' : 'account.html');

  const TEXT = {
    login: ['Welcome back', 'Sign in with your mobile number and password.'],
    signup: ['Create your account', 'Sign up with your mobile number to place orders and track them in one place.']
  };

  function showMode(mode) {
    const signup = mode === 'signup';
    $('#loginForm').hidden = signup;
    $('#signupForm').hidden = !signup;
    $('#tabLogin').setAttribute('aria-selected', String(!signup));
    $('#tabSignup').setAttribute('aria-selected', String(signup));
    [$('#authTitle').textContent, $('#authIntro').textContent] = TEXT[mode];
    $((signup ? '#signupForm' : '#loginForm') + ' .input').focus();
  }

  function setFieldError(input, message) {
    const field = input.closest('.field');
    field.classList.toggle('has-error', Boolean(message));
    input.setAttribute('aria-invalid', String(Boolean(message)));
    $('.field__error', field).textContent = message || '';
  }

  const cleanPhone = (v) => v.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');

  function checkForm(form) {
    let first = null;
    for (const input of $$('.input', form)) {
      let msg = '';
      if (input.name === 'phone') {
        input.value = cleanPhone(input.value);
        // Sign-in also accepts the admin's number, which needn't be a real mobile.
        if (!(form.id === 'signupForm' ? /^[6-9]\d{9}$/ : /^\d{10}$/).test(input.value)) msg = 'Enter a valid 10-digit Indian mobile number.';
      }
      else if (input.name === 'name' && input.value.trim().length < 2) msg = 'Please enter your name.';
      else if (input.name === 'password' && form.id === 'signupForm' && input.value.length < 8) msg = 'Use at least 8 characters.';
      else if (input.name === 'password' && !input.value) msg = 'Please enter your password.';
      setFieldError(input, msg);
      if (msg && !first) first = input;
    }
    if (first) first.focus();
    return !first;
  }

  async function submit(form, path, errorEl) {
    errorEl.textContent = '';
    if (!checkForm(form)) return;
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      const { user } = await api(path, { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      location.href = destination(user);
    } catch (err) {
      button.disabled = false;
      const fields = err.body && err.body.fields;
      if (fields) Object.entries(fields).forEach(([name, msg]) => { const el = form.elements[name]; if (el) setFieldError(el, msg); });
      errorEl.textContent = err.message;
    }
  }

  Store.onReady(() => {
    // Already signed in: carry on to where they were going.
    if (Store.user) { location.replace(destination(Store.user)); return; }

    $('#tabLogin').addEventListener('click', () => showMode('login'));
    $('#tabSignup').addEventListener('click', () => showMode('signup'));
    $('#loginForm').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, '/auth/login', $('#loginError')); });
    $('#signupForm').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, '/auth/signup', $('#signupError')); });
    // Clear a field's error as soon as it's edited.
    $$('.input').forEach((el) => el.addEventListener('input', () => { if (el.closest('.field').classList.contains('has-error')) setFieldError(el, ''); }));

    showMode(params.get('mode') === 'signup' ? 'signup' : 'login');
  });
})();
