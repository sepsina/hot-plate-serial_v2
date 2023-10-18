import { Directive, ElementRef, HostListener} from '@angular/core';

@Directive({
    selector: '[selOnFocus]'
})
export class SelOnFocus {

    constructor(public elRef: ElementRef) {

    }
    @HostListener('focus') onFocus() {
        this.elRef.nativeElement.select();
    }
}
