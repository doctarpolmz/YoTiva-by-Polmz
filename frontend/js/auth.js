/* auth.js */
const Auth = {
  user: JSON.parse(localStorage.getItem('kyabiz_user') || 'null'),

  init: function () {
    document.getElementById('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      Auth.handleLogin();
    });
    document.getElementById('logoutBtn').addEventListener('click', function () { Auth.logout(); });

    Auth.showLogin();
    if (Api.token && Auth.user) {
      Auth.validateSession();
    }
  },

  handleLogin: function () {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errBox = document.getElementById('loginError');
    errBox.hidden = true;

    Api.call('login', { email: email, password: password }).then(function (data) {
      Api.setToken(data.token);
      Auth.user = { name: data.name, role: data.role, userId: data.userId };
      localStorage.setItem('kyabiz_user', JSON.stringify(Auth.user));
      Auth.showApp();
    }).catch(function (err) {
      errBox.textContent = friendlyError(err);
      errBox.hidden = false;
    });
  },

  validateSession: function () {
    Api.call('getDashboard', {}).then(function () {
      Auth.showApp();
    }).catch(function () {
      Auth.logout();
    });
  },

  logout: function () {
    Api.call('logout', {}).catch(function () {});
    Api.setToken(null);
    localStorage.removeItem('kyabiz_user');
    Auth.user = null;
    Auth.showLogin();
  },

  showLogin: function () {
    document.getElementById('loginView').hidden = false;
    document.getElementById('appShell').hidden = true;
  },

  showApp: function () {
    document.getElementById('loginView').hidden = true;
    document.getElementById('appShell').hidden = false;
    document.getElementById('userName').textContent = Auth.user.name;
    document.getElementById('userRole').textContent = Auth.user.role;
    App.updateNavPermissions();
    App.navigate('dashboard');
  },

  can: function (permissionKey) {
    // Mirrors the server-side PERMISSIONS matrix for UI hints only.
    // The backend re-checks everything — this only avoids showing
    // buttons a role can't use.
    const map = {
      'sales.create': ['OWNER', 'MANAGER', 'CASHIER'],
      'sales.view': ['OWNER', 'MANAGER', 'CASHIER', 'ACCOUNTANT'],
      'products.edit': ['OWNER', 'MANAGER', 'STOREKEEPER'],
      'products.editPrice': ['OWNER', 'MANAGER'],
      'inventory.view': ['OWNER', 'MANAGER', 'STOREKEEPER', 'ACCOUNTANT'],
      'inventory.adjust': ['OWNER', 'MANAGER', 'STOREKEEPER'],
      'finance.view': ['OWNER', 'MANAGER', 'ACCOUNTANT'],
      'reports.export': ['OWNER', 'MANAGER', 'ACCOUNTANT'],
      'users.manage': ['OWNER'],
      'purchases.manage': ['OWNER', 'MANAGER', 'STOREKEEPER'],
      'expenses.manage': ['OWNER', 'MANAGER', 'ACCOUNTANT']
    };
    return (map[permissionKey] || []).indexOf(Auth.user.role) !== -1;
  }
};
