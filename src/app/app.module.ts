import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';
import { SelOnFocus } from './selOnFocus';
import { AppComponent } from './app.component';

@NgModule({
  declarations: [
    AppComponent,
    SelOnFocus
  ],
  imports: [
    BrowserModule,
    FormsModule,
    ReactiveFormsModule,
    NgChartsModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
