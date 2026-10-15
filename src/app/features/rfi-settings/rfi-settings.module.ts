import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { ToastrModule } from 'ngx-toastr';

import { RfiSettingsComponent } from './rfi-settings.component';
import { RfiSettingsService } from './rfi-settings.service';

@NgModule({
  declarations: [
    RfiSettingsComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    HttpClientModule,
    ToastrModule.forRoot({
      timeOut: 4000,
      positionClass: 'toast-top-right',
      preventDuplicates: true,
    })
  ],
  providers: [
    RfiSettingsService
  ],
  exports: [
    RfiSettingsComponent
  ]
})
export class RfiSettingsModule { }
