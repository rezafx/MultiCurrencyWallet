import React, { Component, Fragment } from 'react'

import { connect } from 'redaction'
import actions from 'redux/actions'
import Slider from 'pages/Wallet/components/WallerSlider';
import { withRouter } from 'react-router-dom'

import { links, constants, ethToken } from 'helpers'
import { getTokenWallet, getBitcoinWallet, getEtherWallet } from 'helpers/links'


import CSSModules from 'react-css-modules'
import styles from './CurrencyWallet.scss'
import stylesHere from '../History/History.scss'

import Row from 'pages/History/Row/Row'
import SwapsHistory from 'pages/History/SwapsHistory/SwapsHistory'

import Table from 'components/tables/Table/Table'
import PageSeo from 'components/Seo/PageSeo'
import { getSeoPage } from 'helpers/seo'
import { FormattedMessage, injectIntl, defineMessages } from 'react-intl'
import { localisedUrl } from 'helpers/locale'
import config from 'app-config'
import BalanceForm from 'pages/Wallet/components/BalanceForm/BalanceForm'
import { BigNumber } from 'bignumber.js'
import ContentLoader from 'components/loaders/ContentLoader/ContentLoader'
import Tabs from "components/Tabs/Tabs"
import FilterForm from "components/FilterForm/FilterForm"

import getCurrencyKey from 'helpers/getCurrencyKey'


const isWidgetBuild = config && config.isWidget

@connect(({ signUp: { isSigned } }) => ({
  isSigned
}))

@connect(({ core, user, history: { transactions, swapHistory }, history,
  user: {
    ethData,
    btcData,
    btcMultisigSMSData,
    btcMultisigUserData,
    isFetching,
    tokensData } }) => ({
      items: [
        ethData,
        btcData,
        btcMultisigSMSData,
        btcMultisigUserData,
        ...Object.keys(tokensData).map(k => (tokensData[k]))],
      tokens: [...Object.keys(tokensData).map(k => (tokensData[k]))],
      user,
      historyTx: history,
      hiddenCoinsList: core.hiddenCoinsList,
      txHistory: transactions,
      swapHistory,
      isFetching
    }))

@injectIntl
@withRouter
@CSSModules({ ...styles, ...stylesHere }, { allowMultiple: true })
export default class CurrencyWallet extends Component {

  constructor(props) {
    super(props)

    const {
      match: {
        params: {
          fullName = null,
          ticker = null,
          address = null,
        },
      },
      intl: {
        locale,
      },
      //items,
      txHistory
    } = props

    const items = actions.core.getWallets()

    if (!address && !ticker) {
      if (fullName) {
        // Если это токен - перенаправляем на адрес /token/name/address
        if (ethToken.isEthToken({ name: fullName })) {
          this.state = {
            ... this.state,
            ... {
              isRedirecting: true,
              redirectUrl: getTokenWallet(fullName),
            }
          }
          return
        }

        if (fullName.toLowerCase() === `bitcoin`) {
          this.state = {
            ... this.state,
            ... {
              isRedirecting: true,
              redirectUrl: getBitcoinWallet(),
            }
          }
          return
        }

        if (fullName.toLowerCase() === `ethereum`) {
          this.state = {
            ... this.state,
            ... {
              isRedirecting: true,
              redirectUrl: getEtherWallet(),
            }
          }
          return
        }
      }
      // @ToDO throw error

    }

    const walletAddress = address

    // оставляю запасной вариант для старых ссылок
    if (fullName) {
      ticker = fullName
    }

    // MultiWallet - after Sweep - названию валюты доверять нельзя - нужно проверяться также адрес - и выбирать по адресу
    let itemCurrency = items.filter((item) => {
      if (ethToken.isEthToken({ name: ticker })) {
        if (item.currency.toLowerCase() === ticker.toLowerCase()
          && item.address.toLowerCase() === walletAddress.toLowerCase()
        ) {
          return true
        }
      } else {
        if (!ethToken.isEthToken({ name: ticker })
          && item.address.toLowerCase() === walletAddress.toLowerCase()
        ) {
          return true
        }
      }
    })
    if (!itemCurrency.length) {
      itemCurrency = items.filter((item) => {
        if (item.balance > 0
          && item.currency.toLowerCase() === ticker.toLowerCase()) return true
      })
    }
    if (!itemCurrency.length) {
      itemCurrency = items.filter((item) => {
        if (item.balance >= 0
          && item.currency.toLowerCase() === ticker.toLowerCase()) return true
      })
    }

    if (itemCurrency.length) {
      itemCurrency = itemCurrency[0]

      const {
        currency,
        address,
        contractAddress,
        decimals,
        balance,
        infoAboutCurrency
      } = itemCurrency

      this.state = {
        address,
        balance,
        decimals,
        currency,
        txItems: false,
        contractAddress,
        isLoading: false,
        infoAboutCurrency,
        filterValue: address || "",
        isBalanceEmpty: balance === 0,
        token: ethToken.isEthToken({ name: ticker }),

      }
    }
  }

  componentDidMount() {

    const {
      currency,
      token,
      isRedirecting,
      redirectUrl,
    } = this.state

    if (isRedirecting) {
      const { history, intl: { locale } } = this.props
      history.push(localisedUrl(locale, redirectUrl))
      setTimeout(() => {
        location.reload()
      }, 100)
      return
    }

    let {
      match: {
        params: {
          address = null
        }
      }
    } = this.props

    if (currency) {
      // actions.analytics.dataEvent(`open-page-${currency.toLowerCase()}-wallet`)
    }
    if (token) {
      actions.token.getBalance(currency.toLowerCase())
    }

    // set balance for the address
    address && actions[getCurrencyKey(currency.toLowerCase())].fetchBalance(address).then(balance => this.setState({ balance }))

    this.setLocalStorageItems();

    // if address is null, take transactions from current user
    address ? actions.history.setTransactions(address, currency.toLowerCase(), this.pullTransactions) : actions.user.setTransactions()

    if (!address)
      actions.core.getSwapHistory()
  }

  componentDidUpdate(prevProps) {
    const { currency } = this.state

    let {
      match: {
        params: {
          address = null
        }
      },
    } = this.props

    let {
      match: {
        params: {
          address: prevAddress = null
        }
      }
    } = prevProps
    if (prevAddress !== address) {
      address ? actions.history.setTransactions(address, currency.toLowerCase(), this.pullTransactions) : actions.user.setTransactions()
    }

  }

  getRows = (txHistory) => {
    this.setState(() => ({ rows: txHistory }))
  }

  pullTransactions = (transactions) => {
    let data = [].concat([], ...transactions).sort((a, b) => b.date - a.date)
    this.setState({
      txItems: data
    })
  }

  setLocalStorageItems = () => {
    const isClosedNotifyBlockBanner = localStorage.getItem(constants.localStorage.isClosedNotifyBlockBanner);
    const isClosedNotifyBlockSignUp = localStorage.getItem(constants.localStorage.isClosedNotifyBlockSignUp);
    const isPrivateKeysSaved = localStorage.getItem(constants.localStorage.privateKeysSaved)
    const walletTitle = localStorage.getItem(constants.localStorage.walletTitle);

    this.setState({
      isClosedNotifyBlockBanner,
      isClosedNotifyBlockSignUp,
      walletTitle,
      isPrivateKeysSaved
    })
  }

  handleReceive = () => {
    const { currency, address } = this.state

    actions.modals.open(constants.modals.ReceiveModal, {
      currency,
      address,
    })
  }

  handleInvoice = () => {
    const {
      currency,
      address
    } = this.state

    actions.modals.open(constants.modals.InvoiceModal, {
      currency: currency.toUpperCase(),
      toAddress: address
    })
  }

  handleWithdraw = () => {

    const {
      currency,
      address,
      contractAddress,
      decimals,
      balance,
      isBalanceEmpty,
    } = this.state

    // actions.analytics.dataEvent(`balances-withdraw-${currency.toLowerCase()}`)
    let withdrawModal = constants.modals.Withdraw
    if (actions.btcmultisig.isBTCSMSAddress(address)) {
      withdrawModal = constants.modals.WithdrawMultisigSMS
    }
    if (actions.btcmultisig.isBTCMSUserAddress(address)) {
      withdrawModal = constants.modals.WithdrawMultisigUser
    }

    actions.modals.open(withdrawModal, {
      currency,
      address,
      contractAddress,
      decimals,
      balance,
    })
  }

  handleGoWalletHome = () => {
    const { history, intl: { locale } } = this.props

    history.push(localisedUrl(locale, links.wallet))
  }

  handleGoTrade = () => {
    const { currency } = this.state
    const { history, intl: { locale } } = this.props

    history.push(localisedUrl(locale, `${links.pointOfSell}/btc-to-${currency.toLowerCase()}`))
  }

  rowRender = (row, rowIndex) => (
    <Row key={rowIndex} {...row} />
  )

  handleFilterChange = ({ target }) => {
    const { value } = target

    this.setState(() => ({ filterValue: value }))
  }

  handleFilter = () => {
    const { filterValue, txItems } = this.state
    this.loading()

    if (filterValue.toLowerCase() && filterValue.length) {
      const newRows = txItems.filter(({ address }) => address && address.toLowerCase().includes(filterValue.toLowerCase()))

      this.setState(() => ({ txItems: newRows }))
    } else {
      this.resetFilter()
    }
  }

  loading = () => {
    this.setState(() => ({ isLoading: true }))
    setTimeout(() => this.setState(() => ({ isLoading: false })), 1000)
  }

  resetFilter = () => {


    this.loading()
    const { address, currency } = this.state
    this.setState(() => ({ filterValue: address }))
    actions.history.setTransactions(address, currency.toLowerCase(), this.pullTransactions)
  }

  render() {
    let { swapHistory, txHistory, location, match: { params: { address = null } }, intl, hiddenCoinsList, isSigned, isFetching } = this.props

    const {
      currency,
      balance,
      fullName,
      infoAboutCurrency,
      isRedirecting,
      txItems,
      filterValue,
      isLoading
    } = this.state

    const currencyKey = getCurrencyKey(currency, true)

    if (isRedirecting) return null

    txHistory = txItems || txHistory


    if (txHistory) {
      txHistory = txHistory
        .filter((tx) => {
          if (tx
            && tx.type
          ) {
            return tx.type.toLowerCase() === currencyKey.toLowerCase()
          }
          return false
        })
    }

    swapHistory = Object.keys(swapHistory)
      .map(key => swapHistory[key])
      .filter(swap => swap.sellCurrency === currency || swap.buyCurrency === currency)
      .reverse()

    const seoPage = getSeoPage(location.pathname)

    const titleSwapOnline = defineMessages({
      metaTitle: {
        id: 'CurrencyWalletTitle',
        defaultMessage: 'Swap.Online - {fullName} ({currency}) Web Wallet with Atomic Swap.',
      },
    })
    const titleWidgetBuild = defineMessages({
      metaTitle: {
        id: 'CurrencyWalletWidgetBuildTitle',
        defaultMessage: '{fullName} ({currency}) Web Wallet with Atomic Swap.',
      },
    })
    const title = (isWidgetBuild) ? titleWidgetBuild : titleSwapOnline

    const description = defineMessages({
      metaDescription: {
        id: 'CurrencyWallet154',
        defaultMessage: 'Atomic Swap Wallet allows you to manage and securely exchange ${fullName} (${currency}) with 0% fees. Based on Multi-Sig and Atomic Swap technologies.',
      },
    })

    if (hiddenCoinsList.includes(currency)) {
      actions.core.markCoinAsVisible(currency)
    }

    /** 27.02.2020 не знаю что это такое, но оно не используется, и ломает мне код
     * пока закоментил - через месяц можно удалять
    const isBlockedCoin = config.noExchangeCoins
      .map(item => item.toLowerCase())
      .includes(currency.toLowerCase())
       */

    let currencyUsdBalance;
    let changePercent;

    if (infoAboutCurrency) {
      currencyUsdBalance = BigNumber(balance).dp(5, BigNumber.ROUND_FLOOR).toString() * infoAboutCurrency.price_usd;
      changePercent = infoAboutCurrency.percent_change_1h;
    } else {
      currencyUsdBalance = 0;
    }

    let settings = {
      infinite: true,
      speed: 500,
      autoplay: true,
      autoplaySpeed: 6000,
      fade: true,
      slidesToShow: 1,
      slidesToScroll: 1
    };

    return (
      <div styleName="root">
        <PageSeo
          location={location}
          defaultTitle={intl.formatMessage(title.metaTitle, { fullName, currency })}
          defaultDescription={intl.formatMessage(description.metaDescription, { fullName, currency })} />
        <Slider
          settings={settings}
          isSigned={isSigned}
          handleNotifyBlockClose={this.handleNotifyBlockClose}
          {...this.state}
        />
        <Tabs activeView={1} />
        <Fragment>
          <div styleName="currencyWalletWrapper">
            <div styleName="currencyWalletBalance">
              {
                txHistory ?
                  <BalanceForm
                    currencyBalance={balance}
                    usdBalance={currencyUsdBalance}
                    changePercent={changePercent}
                    address={address}
                    handleReceive={this.handleReceive}
                    handleWithdraw={this.handleWithdraw}
                    handleExchange={this.handleGoTrade}
                    handleInvoice={this.handleInvoice}
                    showButtons={actions.user.isOwner(address, currency)}
                    currency={currency.toLowerCase()}
                  /> : <ContentLoader leftSideContent />
              }
            </div>
            <div styleName="currencyWalletActivityWrapper">
              <div styleName="currencyWalletActivity">
                <FilterForm filterValue={filterValue} onSubmit={this.handleFilter} onChange={this.handleFilterChange} resetFilter={this.resetFilter} />
                {txHistory && !isLoading && (
                  txHistory.length > 0 ? (
                    <Table rows={txHistory} styleName="currencyHistory" rowRender={this.rowRender} />
                  ) :
                    <div styleName="historyContent">
                      <ContentLoader rideSideContent empty nonHeader inner />
                    </div>
                )
                }
                {(!txHistory || isLoading) && (
                  <div styleName="historyContent">
                    <ContentLoader rideSideContent nonHeader />
                  </div>
                )}
              </div>
              {(!actions.btcmultisig.isBTCSMSAddress(`${address}`) && !actions.btcmultisig.isBTCMSUserAddress(`${address}`)) && (
                swapHistory.filter(item => item.step >= 4).length > 0 ? (
                  <div styleName="currencyWalletSwapHistory">
                    <SwapsHistory orders={swapHistory.filter(item => item.step >= 4)} />
                  </div>
                ) : ''
              )}
            </div>
          </div>
          {
            seoPage && seoPage.footer && <div>{seoPage.footer}</div>
          }
        </Fragment>
      </div>
    )
  }
}