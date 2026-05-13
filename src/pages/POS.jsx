import POSLeft from '../components/POSLeft.jsx'
import POSRight from '../components/POSRight.jsx'
import './POS.css'

export default function POS() {
    return (
        <div className="pos-layout">
            <POSLeft />
            <POSRight />
        </div>
    )
}
