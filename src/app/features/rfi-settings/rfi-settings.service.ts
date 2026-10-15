import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError, BehaviorSubject } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

/**
 * Matches backend RfiSettingsDto.java (RfiSettingsController /
 * RfiSettingsService, the "MERGED" controller). A few important quirks
 * vs. what this file used to assume:
 *
 * - GET/POST /api/rfi-settings return the DTO directly — there is no
 *   { success, message, data } envelope on the happy path.
 * - gmailClientId is now required on save; gmailClientSecret is only
 *   required the FIRST time (omit on later saves to keep the stored one).
 * - toContacts/ccContacts come back on every GET/POST too (the merged
 *   DTO includes them), but this service only cares about the Gmail
 *   fields, so they're typed as optional/unused here.
 * - gmailClientSecret and gmailRefreshToken ARE present in the response
 *   JSON (encrypted, but present — RfiSettingsService.mapToDto sends them
 *   despite a comment claiming the controller scrubs them; it doesn't).
 *   This service deliberately never copies those two fields back into
 *   the form — patch only the fields that are safe to redisplay. Get the
 *   backend to stop returning them; don't rely on the frontend hiding it.
 * - There is no dedicated "not found" status: RfiSettingsService throws
 *   ResourceNotFoundException, which GlobalExceptionHandler's generic
 *   RuntimeException handler turns into a plain HTTP 400 (not 404),
 *   with body { success: false, error: "..." }. getSettings() below
 *   treats any error on GET as "nothing configured yet" and resolves to
 *   null instead of surfacing a toast, since GET has no input that could
 *   otherwise cause a validation 400.
 */
export interface RfiSettings {
  id?: number;
  gmailEmail: string;
  gmailClientId: string;
  /** Write-only in practice: send when connecting/replacing, never redisplay a value you got back from the server. */
  gmailClientSecret?: string;
  /** Write-only in practice: send when connecting/replacing, never redisplay a value you got back from the server. */
  gmailRefreshToken?: string;
  tokenValid?: boolean;
  tokenExpiryDate?: string;
}

interface RawApiError {
  success: boolean;
  error?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class RfiSettingsService {

  private apiUrl = 'http://localhost:8080/api/rfi-settings'; // Change to your backend URL

  private settingsSubject = new BehaviorSubject<RfiSettings | null>(null);
  public settings$ = this.settingsSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  public error$ = this.errorSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Get current user's RFI settings.
   * Resolves to `null` (not an error) when nothing has been configured
   * yet — see the class doc above for why that's a 400, not a 404, on
   * this particular backend.
   */
  getSettings(): Observable<RfiSettings | null> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    return this.http.get<RfiSettings>(this.apiUrl).pipe(
      tap(settings => {
        this.settingsSubject.next(settings);
        this.loadingSubject.next(false);
      }),
      catchError((error: HttpErrorResponse) => {
        this.loadingSubject.next(false);
        // GET takes no input, so any error here means "not configured
        // yet" rather than a real validation failure — don't toast it.
        this.settingsSubject.next(null);
        return of(null);
      })
    );
  }

  /**
   * Save or update RFI settings.
   * Omit gmailClientSecret / gmailRefreshToken to keep the previously
   * saved value (backend only overwrites a field when it's non-blank).
   */
  saveSettings(settings: RfiSettings): Observable<RfiSettings> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    return this.http.post<RfiSettings>(this.apiUrl, settings).pipe(
      tap(saved => {
        this.settingsSubject.next(saved);
        this.errorSubject.next(null);
        this.loadingSubject.next(false);
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        this.handleErrorResponse(error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Validate the stored Gmail refresh token.
   * POST /api/rfi-settings/validate-token -> raw { valid: boolean }.
   */
  validateToken(): Observable<{ valid: boolean }> {
    return this.http.post<{ valid: boolean }>(`${this.apiUrl}/validate-token`, {}).pipe(
      catchError(error => this.handleError(error))
    );
  }

  /**
   * Clear stored token. DELETE /api/rfi-settings/token -> raw { message }.
   */
  clearToken(): Observable<{ message: string }> {
    this.loadingSubject.next(true);
    return this.http.delete<{ message: string }>(`${this.apiUrl}/token`).pipe(
      tap(() => {
        // Token cleared, but gmailEmail/gmailClientId are still configured
        // server-side — refresh from the server rather than nulling out
        // local state, so the form doesn't look "unconfigured".
        this.loadingSubject.next(false);
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        return this.handleError(error);
      })
    );
  }

  /**
   * Get current settings from BehaviorSubject (without HTTP call)
   */
  getCurrentSettings(): RfiSettings | null {
    return this.settingsSubject.getValue();
  }

  /**
   * Extract a human message from the backend's error envelope.
   * GlobalExceptionHandler always responds with ApiResponse.error(...),
   * i.e. { success: false, error: "..." } — note the field is `error`,
   * not `message`.
   */
  private extractErrorMessage(error: HttpErrorResponse, fallback: string): string {
    const body = error.error as RawApiError | undefined;
    if (error.error instanceof ErrorEvent) {
      return `Error: ${error.error.message}`;
    }
    if (body?.error) return body.error;
    if (body?.message) return body.message;
    return fallback;
  }

  /**
   * Handle error responses (for calls that should surface an error, e.g. save/validate)
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage: string;

    if (error.status === 401) {
      errorMessage = 'Unauthorized. Please log in again.';
    } else if (error.status === 500) {
      errorMessage = 'Server error. Please try again later.';
    } else {
      errorMessage = this.extractErrorMessage(error, 'An error occurred while processing your request.');
    }

    this.errorSubject.next(errorMessage);
    return throwError(() => new Error(errorMessage));
  }

  /**
   * Handle error response and update error subject (for saveSettings, which
   * needs to keep the raw error flowing to the caller as well).
   */
  private handleErrorResponse(error: HttpErrorResponse): void {
    let errorMessage: string;

    if (error.status === 401) {
      errorMessage = 'Please log in again';
    } else if (error.status === 500) {
      errorMessage = 'Server error. Please try again later';
    } else {
      errorMessage = this.extractErrorMessage(error, 'Invalid settings provided');
    }

    this.errorSubject.next(errorMessage);
  }

  /**
   * Clear error message
   */
  clearError(): void {
    this.errorSubject.next(null);
  }
}