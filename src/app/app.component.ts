import { Component, HostListener, OnDestroy, OnInit, NgZone, ViewChild, ElementRef } from '@angular/core';
import { EventsService } from './events.service';
import { SerialService } from './serial.service';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import * as gConst from './gConst';
import * as gIF from './gIF';
import * as regression from 'regression'
//import * as LPF from 'lpf';

const INVALID_TEMP = -1000;
const BAD_CNT = 5;
const CHART_LEN = 31;
const LIN_CNT = 12;

const TC_IDX = 2;
const SP_IDX = 1;
const REG_IDX = 0;

const SP_MAX = 250;
const DUTY_MAX = 40;
const HIST_MAX = 2;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy{

    @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

    @HostListener('document:keyup', ['$event'])
    handleKeyboardEvent(event: KeyboardEvent) {
        switch(event.key){
            case 'Escape': {
                console.log(`escape pressed`);
                this.runFlag = false;
                this.setPoint = 27;
                break;
            }
        }
    }
    tc = '--.- degC';
    tcTemp: number;

    tsRunFlag = 0;
    tsSetPoint = 20;
    tsHist = 1;
    tsDuty = 50;

    tsStatus = '';
    syncFlag = true;
    syncDis = false;

    //chartLen = CHART_LEN;
    chartTime: number[] = [];
    secTime: number[] = [];

    lastValid: number = INVALID_TEMP;
    badCnt = 0;

    trash = true;

    runFlag = false;
    setPoint = 27;
    prevSP: number;
    workPoint: number; 
    ssrDuty = 0;
    hist = 0.5;
    ssrTMO: any;

    regPoint = [];
    regData = [];

    constructor(public serial: SerialService,
                public events: EventsService,
                public ngZone: NgZone) {
        // ---
    }

    /***********************************************************************************************
     * fn          ngOnInit
     *
     * brief
     *
     */
    ngOnInit() {

        this.events.subscribe('newTemp', (msg: gIF.tempRsp_t)=>{
            this.newTemp(msg);
        });

        window.onbeforeunload = ()=>{
            this.ngOnDestroy();
        };

        this.lineChartData.labels = [];
        this.lineChartData.datasets[TC_IDX] = {
            data: [],
            label: 'temp',
            fill: false,
            borderColor: 'lightgray',
            cubicInterpolationMode: 'monotone'
        };
        this.lineChartData.datasets[SP_IDX] = {
            data: [],
            label: 'sp',
            fill: false,
            borderColor: 'black',
            borderDash: [8, 4],
            borderWidth: 2,
            cubicInterpolationMode: 'monotone'
        };
        this.lineChartData.datasets[REG_IDX] = {
            data: [],
            label: 'lin reg',
            fill: false,
            borderColor: 'red',
            borderDash: [8, 4],
            borderWidth: 2,
            cubicInterpolationMode: 'monotone'
        };
        for(let i = 0; i < CHART_LEN; i++){
            this.lineChartData.labels[i] = '';
            this.lineChartData.datasets[TC_IDX].data[i] = null;
            this.lineChartData.datasets[SP_IDX].data[i] = null;
            this.lineChartData.datasets[REG_IDX].data[i] = null;
            this.chartTime.push(0);
            this.secTime.push(0);
        }
        for(let i = 0; i < LIN_CNT; i++){
            this.regPoint = [];
            this.regPoint.push(i);
            this.regPoint.push(0);
            this.regData.push(this.regPoint);
        }

        this.prevSP = this.setPoint;
        this.workPoint = this.setPoint - this.hist;
        setTimeout(()=>{
            this.ssr_tmo();
        }, 1000);
    }

    /***********************************************************************************************
     * fn          ngOnDestroy
     *
     * brief
     *
     */
     ngOnDestroy() {
        this.serial.closeComPort();
    }

    /***********************************************************************************************
     * fn          runChanged
     *
     * brief
     *
     */
    runChanged(flag){
        this.runFlag = flag;
    }

    /***********************************************************************************************
     * fn          spChanged
     *
     * brief
     *
     */
    spChanged(e){
        this.setPoint = parseFloat(e.target.value);
        if(this.setPoint > SP_MAX){
            this.setPoint = SP_MAX;
        }
        this.prevSP = this.setPoint;
        this.workPoint = this.setPoint - this.hist;
    }

    /***********************************************************************************************
     * fn          histChanged
     *
     * brief
     *
     */
    histChanged(e){
        this.hist = parseFloat(e.target.value);
        if(this.hist > HIST_MAX){
            this.hist = HIST_MAX;
        }
        if(this.workPoint > this.setPoint){
            this.workPoint = this.setPoint + this.hist;    
        }
        else {
            this.workPoint = this.setPoint - this.hist;
        }
    }

    /***********************************************************************************************
     * fn          dutyChanged
     *
     * brief
     *
     */
    dutyChanged(e){
        this.ssrDuty = parseFloat(e.target.value);
        if(this.ssrDuty > DUTY_MAX){
            this.ssrDuty = DUTY_MAX;
        }
    }

    /***********************************************************************************************
     * fn          newTemp
     *
     * brief
     *
     */
    newTemp(msg: gIF.tempRsp_t){

        clearTimeout(this.ssrTMO);

        const setSSR = {} as gIF.setSSR_t;
        setSSR.duty = 0;

        if(msg.tcTemp & (1 << 2)){
            this.tcTemp = 1000.0;
        }
        else {
            this.tcTemp = (msg.tcTemp >> 3) / 4.0;
        }
        this.updateGraph();
        if(this.tcTemp){
            if(this.runFlag){
                if(this.tcTemp > this.workPoint){
                    if(this.workPoint > this.setPoint){
                        this.workPoint = this.setPoint - this.hist;
                    }
                }
                if(this.tcTemp < this.workPoint){
                    if(this.workPoint < this.setPoint){
                        this.workPoint = this.setPoint + this.hist;
                    }
                }
                if(this.tcTemp < this.workPoint){
                    if(this.ssrDuty < 100){
                        setSSR.duty = this.ssrDuty;
                    }
                }
            }
        }
        this.serial.setSSR(setSSR);
        
        this.ssrTMO = setTimeout(() => {
            this.ssr_tmo();
        }, 2000);
    }

    /***********************************************************************************************
     * fn          ssr_tmo
     *
     * brief
     *
     */
    ssr_tmo(){
        
        const setSSR = {} as gIF.setSSR_t;
        setSSR.duty = 0;
        this.serial.setSSR(setSSR);

        this.ssrTMO = setTimeout(() => {
            this.ssr_tmo();
        }, 2000);
    }

    /***********************************************************************************************
     * fn          updateGraph
     *
     * brief
     *
     */
    updateGraph(){

        const now = Math.floor(Date.now()/1000);
        this.chartTime.shift();
        this.chartTime.push(now);
        const start = this.chartTime[0];
        if(start > 0){
            for(let i = 0; i < CHART_LEN; i++){
                this.secTime[i] = this.chartTime[i] - start;
            }
            this.lineChartData.labels[0] = this.secTime[CHART_LEN - 1];
            this.lineChartData.labels[CHART_LEN - 1] = 0;
        }

        this.lineChartData.datasets[TC_IDX].data.shift();

        if(this.lastValid === INVALID_TEMP){
            this.lastValid = this.tcTemp;
        }
        else {
            if(Math.abs(this.tcTemp - this.lastValid) > 10){
                this.badCnt++;
                if(this.badCnt > BAD_CNT){
                    this.lastValid = this.tcTemp;
                    this.badCnt = 0;
                }
                else {
                    this.tcTemp = null;
                }
            }
            else {
                this.lastValid = this.tcTemp;
                this.badCnt = 0;
            }
        }
        this.lineChartData.datasets[TC_IDX].data.push(this.tcTemp);

        this.lineChartData.datasets[SP_IDX].data.shift();
        this.lineChartData.datasets[SP_IDX].data.push(this.setPoint);

        this.regData = [];
        for(let i = (CHART_LEN - LIN_CNT); i < CHART_LEN; i++){
            const regPoint = [];
            regPoint.push(this.secTime[i]);
            regPoint.push(this.lineChartData.datasets[TC_IDX].data[i]);
            this.regData.push(regPoint);
        }

        const reg = regression.linear(this.regData);

        this.lineChartData.datasets[REG_IDX].data = [];
        for(let i = 0; i < CHART_LEN; i++){
            this.lineChartData.datasets[REG_IDX].data.push(null);
        }
        for(let i = (CHART_LEN - LIN_CNT); i < CHART_LEN; i++){
            this.lineChartData.datasets[REG_IDX].data[i] = reg.predict(this.secTime[i])[1];
        }

        this.chart.update();

        //this.tcTemp = reg.predict(this.secTime[CHART_LEN - 1])[1];
        this.tcTemp = Number(this.lineChartData.datasets[REG_IDX].data[CHART_LEN - 1]);


        this.ngZone.run(()=>{
            if(this.tcTemp != null){
                this.tc = `tc: ${this.tcTemp.toFixed(1)} degC`;
            }
            else {
                this.tc = `tc: --.- degC`;    
            }
        });
    }

    /***********************************************************************************************
     * fn          Line Chart
     *
     * brief
     *
     */
    lineChartData: ChartConfiguration<'line'>['data'] = {
        labels: [],
        datasets: [null, null, null]
    };

    public lineChartOptions: ChartOptions<'line'> = {
        responsive: true,
        //borderColor: 'blue',
        scales: {
            x: {
                border: {
                    color: 'lightgray'
                },
                grid: {
                    display: false
                },
                ticks: {
                    autoSkip: false,
                    display: true,
                    maxRotation: 0,
                    font: {
                        size: 14,
                        //family: 'Verdana'
                    }
                }
            },
            y: {
                position: 'right',
                border: {
                    dash: [8, 4],
                    color: 'lightgray'
                },
                grid: {
                    //tickColor: 'red',
                    color: 'lightgray',
                    display: true,
                },
                ticks:{
                    //maxTicksLimit: 6,
                    font: {
                        size: 14,
                        //family: 'Verdana'
                    }
                },
                /*
                title: {
                    display: true,
                    text: 'temperatures',
                    font: {
                        size: 16,
                    }
                }
                */
                grace: 1,
            }
        },
        elements: {
            point:{
                radius: 0
            }
        },
        animation: {
            duration: 0
        }
    };
    public lineChartLegend = false;
}
