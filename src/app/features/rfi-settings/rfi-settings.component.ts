import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr'; // For notifications
import { RfiSettingsService, RfiSettings } from './rfi-settings.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-rfi-settings',
  templateUrl: './rfi-settings.component.html',
  styleUrls: ['./rfi-settings.component.css']
})
export class RfiSettingsComponent implements OnInit, OnDestroy {

  settingsForm!: FormGroup;
  loading = false;
  saving = false;
  tokenValid = false;
  /** True once we've loaded settings and gmailClientId/gmailEmail are set — used to make gmailClientSecret optional on later saves. */
  isConfigured = false;
  showTokenInput = false;
  tokenValidationLoading = false;
  successMessage = '';
  errorMessage = '';

  private destroy$ = new Subject<void>();

  constructor(
    private formBuilder: FormBuilder,
    private rfiSettingsService: RfiSettingsService,
    private toastr: ToastrService
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.loadSettings();
    this.subscribeToServiceObservables();
  }

  /**
   * Initialize the form with validators.
   * gmailClientSecret and gmailRefreshToken are intentionally NOT
   * required here: on a re-save the user can leave them blank to keep
   * whatever is already stored server-side (see saveSettings()).
   */
  private initializeForm(): void {
    this.settingsForm = this.formBuilder.group({
      gmailEmail: [
        '',
        [
          Validators.required,
          Validators.email
        ]
      ],
      gmailClientId: ['', [Validators.required]],
      gmailClientSecret: [''],
      gmailRefreshToken: [
        '',
        [this.tokenValidator.bind(this)]
      ]
    });
  }

  /**
   * Custom validator for token format. Optional field (blank = "keep
   * existing"), so only validate length when something was actually typed.
   */
  private tokenValidator(control: any): { [key: string]: any } | null {
    if (!control.value) {
      return null;
    }
    if (control.value.length < 20) {
      return { 'invalidToken': true };
    }
    return null;
  }

  /**
   * Subscribe to service observables
   */
  private subscribeToServiceObservables(): void {
    this.rfiSettingsService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => {
        this.loading = loading;
      });

    this.rfiSettingsService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => {
        if (error) {
          this.errorMessage = error;
          this.toastr.error(error);
        }
      });
  }

  /**
   * Load RFI settings from server.
   * getSettings() now resolves to `null` (not an error) when nothing has
   * been configured yet — see rfi-settings.service.ts for why the backend
   * can't distinguish "not found" from a 400 here.
   */
  loadSettings(): void {
    this.rfiSettingsService.getSettings()
      .pipe(takeUntil(this.destroy$))
      .subscribe(settings => {
        if (settings) {
          // Deliberately do NOT patch gmailClientSecret / gmailRefreshToken
          // from the response — the backend currently still includes
          // encrypted values for both, and round-tripping ciphertext into
          // a plaintext field would just corrupt it on the next save.
          this.settingsForm.patchValue({
            gmailEmail: settings.gmailEmail || '',
            gmailClientId: settings.gmailClientId || ''
          });
          this.tokenValid = settings.tokenValid !== false;
          this.isConfigured = true;
          // Client Secret becomes optional now that one is on file.
          this.settingsForm.get('gmailClientSecret')?.clearValidators();
          this.settingsForm.get('gmailClientSecret')?.updateValueAndValidity();
          this.toastr.success('Settings loaded successfully');
        } else {
          this.isConfigured = false;
          this.tokenValid = false;
          // First-time setup: Client Secret is required.
          this.settingsForm.get('gmailClientSecret')?.setValidators([Validators.required]);
          this.settingsForm.get('gmailClientSecret')?.updateValueAndValidity();
          this.toastr.info('No existing settings found. Create new settings below.');
        }
      });
  }

  /**
   * Save settings to server
   */
  saveSettings(): void {
    // Clear previous messages
    this.successMessage = '';
    this.errorMessage = '';
    this.rfiSettingsService.clearError();

    if (this.settingsForm.invalid) {
      this.toastr.error('Please fill in all required fields correctly');
      this.markFormGroupTouched(this.settingsForm);
      return;
    }

    this.saving = true;
    const formValue = this.settingsForm.value;
    const settings: RfiSettings = {
      gmailEmail: formValue.gmailEmail,
      gmailClientId: formValue.gmailClientId
    };
    // Only send secrets that were actually typed — blank means "keep the
    // one already stored", which the backend honors on its end too.
    if (formValue.gmailClientSecret && formValue.gmailClientSecret.trim()) {
      settings.gmailClientSecret = formValue.gmailClientSecret.trim();
    }
    if (formValue.gmailRefreshToken && formValue.gmailRefreshToken.trim()) {
      settings.gmailRefreshToken = formValue.gmailRefreshToken.trim();
    }

    this.rfiSettingsService.saveSettings(settings)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (saved) => {
          this.saving = false;
          this.isConfigured = true;
          this.tokenValid = saved.tokenValid !== false;
          this.successMessage = 'Settings saved successfully!';
          this.toastr.success('✓ RFI Settings saved successfully');

          // Client Secret is now on file — make it optional going forward,
          // and clear the plaintext fields out of the form so they aren't
          // sitting in memory/DOM longer than needed.
          this.settingsForm.get('gmailClientSecret')?.clearValidators();
          this.settingsForm.get('gmailClientSecret')?.updateValueAndValidity();
          this.settingsForm.patchValue({ gmailClientSecret: '', gmailRefreshToken: '' });

          setTimeout(() => {
            this.successMessage = '';
          }, 5000);
        },
        error: (error) => {
          this.saving = false;
          this.errorMessage = error.message || 'Failed to save settings';
          this.toastr.error('✗ Failed to save settings: ' + this.errorMessage);
        }
      });
  }

  /**
   * Validate the current token.
   * validateToken() now resolves to a raw { valid: boolean }.
   */
  validateToken(): void {
    const emailControl = this.settingsForm.get('gmailEmail');

    if (!emailControl || !emailControl.value) {
      this.toastr.warning('Please enter your Gmail email first');
      return;
    }

    this.tokenValidationLoading = true;

    this.rfiSettingsService.validateToken()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.tokenValidationLoading = false;
          if (response.valid) {
            this.tokenValid = true;
            this.toastr.success('✓ Token is valid');
          } else {
            this.tokenValid = false;
            this.toastr.error('✗ Token is invalid or expired');
          }
        },
        error: (error) => {
          this.tokenValidationLoading = false;
          this.tokenValid = false;
          this.toastr.error('Token validation failed: ' + error.message);
        }
      });
  }

  /**
   * Clear the token
   */
  clearToken(): void {
    if (confirm('Are you sure you want to clear the token? You will need to re-authenticate.')) {
      this.rfiSettingsService.clearToken()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.settingsForm.patchValue({ gmailRefreshToken: '' });
            this.tokenValid = false;
            this.showTokenInput = false;
            this.toastr.info('Token cleared. Please add a new token.');
          },
          error: () => {
            this.toastr.error('Failed to clear token');
          }
        });
    }
  }

  /**
   * Toggle token input visibility
   */
  toggleTokenInput(): void {
    this.showTokenInput = !this.showTokenInput;
  }

  /**
   * Copy token to clipboard
   */
  copyToClipboard(elementId: string): void {
    const element = document.getElementById(elementId);
    if (element && element.textContent) {
      navigator.clipboard.writeText(element.textContent).then(() => {
        this.toastr.success('Copied to clipboard');
      });
    }
  }

  /**
   * Get error message for a form field
   */
  getFieldError(fieldName: string): string {
    const field = this.settingsForm.get(fieldName);

    if (field && field.errors && field.touched) {
      if (field.errors['required']) {
        return `${this.formatFieldName(fieldName)} is required`;
      }
      if (field.errors['email']) {
        return 'Please enter a valid email address';
      }
      if (field.errors['invalidToken']) {
        return 'Token must be at least 20 characters';
      }
    }
    return '';
  }

  /**
   * Format field name for display
   */
  private formatFieldName(name: string): string {
    return name.replace(/([A-Z])/g, ' $1').trim();
  }

  /**
   * Mark all fields as touched to show validation errors
   */
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  /**
   * Check if field has error
   */
  hasError(fieldName: string): boolean {
    const field = this.settingsForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }

  /**
   * Reset form
   */
  resetForm(): void {
    this.settingsForm.reset();
    this.successMessage = '';
    this.errorMessage = '';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}